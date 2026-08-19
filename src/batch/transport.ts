import packageJson from "../../package.json" with { type: "json" };
import { ZenRowsBatchError, parseProblem } from "./errors.js";

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE", "HEAD", "OPTIONS"]);

const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 10_000;
const DEFAULT_RETRIES = 3;

function isIdempotent(method: string, hasIdempotencyKey: boolean): boolean {
  return (
    IDEMPOTENT_METHODS.has(method.toUpperCase()) ||
    (method.toUpperCase() === "POST" && hasIdempotencyKey)
  );
}

/** Jittered exponential backoff for retry `attempt` (0-based), in milliseconds. */
function backoffMs(attempt: number): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
  return base * (1 + (Math.random() * 2 - 1) * 0.2);
}

function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isNaN(secs) || secs < 0) return undefined;
  return secs * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RequestOptions {
  query?: object;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

/**
 * Thin HTTP transport for the Batch API: `X-API-Key` auth, retries for transient failures
 * (429/502/503/504 + network errors) on idempotent requests only, and RFC 7807 → `ZenRowsBatchError`
 * mapping. Mirrors the Python SDK's `_transport.py` exactly (250ms · 2^attempt backoff, ±20%
 * jitter, capped at 10s, honors `Retry-After`).
 */
export class BatchTransport {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
    private readonly retries: number = DEFAULT_RETRIES,
  ) {}

  /** Send a request, parse the response, throw `ZenRowsBatchError` on non-2xx. */
  async requestJson<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(method, path, options);
    if (!response.ok) {
      const { problem, extras } = await parseProblem(response);
      throw new ZenRowsBatchError(response.status, problem, extras);
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  /** Send a request and return the raw `Response` — used for endpoints that don't return JSON. */
  async requestRaw(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
    const response = await this.send(method, path, options);
    if (!response.ok) {
      const { problem, extras } = await parseProblem(response);
      throw new ZenRowsBatchError(response.status, problem, extras);
    }
    return response;
  }

  private buildUrl(path: string, query?: object): URL {
    const url = new URL(`${this.baseURL}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url;
  }

  private async send(method: string, path: string, options: RequestOptions): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "User-Agent": `zenrows/${packageJson.version} node`,
      ...options.headers,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const idempotent = isIdempotent(method, Boolean(options.idempotencyKey));
    let attempt = 0;
    while (true) {
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
      } catch (error) {
        if (idempotent && attempt < this.retries) {
          await sleep(backoffMs(attempt));
          attempt += 1;
          continue;
        }
        throw error;
      }

      if (idempotent && attempt < this.retries && RETRYABLE_STATUSES.has(response.status)) {
        const wait = retryAfterMs(response) ?? backoffMs(attempt);
        await sleep(wait);
        attempt += 1;
        continue;
      }

      return response;
    }
  }
}
