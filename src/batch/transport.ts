/**
 * HTTP transport for the Batch client.
 *
 * Owns the `fetch` call, the `X-API-Key` auth header, the default
 * User-Agent, the camel↔snake mapping at the wire boundary, and the
 * RFC 7807 → {@link BatchApiError} mapping. The facade (`client.ts`) is
 * thin glue over this — one method per endpoint.
 */

import { camelize, decamelize } from "./case.js";
import { BatchApiError } from "./errors.js";

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  /** camelCase request body; decamelized + JSON-encoded before sending. */
  body?: unknown;
  params?: QueryParams;
  headers?: Record<string, string>;
}

export interface TransportConfig {
  baseUrl: string;
  apiKey: string;
  userAgent: string;
  /** Milliseconds. */
  timeout: number;
  /** Max automatic retries for transient failures on idempotent requests. */
  retries: number;
  fetch?: typeof fetch;
}

// Transient statuses worth retrying. 429 (rate limited), 502/503/504
// (gateway / transient upstream — the spec marks 503 "safe to retry").
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
// Methods safe to replay without side effects. POST is added only when
// the caller supplied an Idempotency-Key (submit / rerun).
const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE", "HEAD", "OPTIONS"]);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function hasIdempotencyKey(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === "idempotency-key");
}

/** Parse a `Retry-After` header (delta-seconds only) to milliseconds. */
function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (!raw) return undefined;
  const secs = Number(raw);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : undefined;
}

export class Transport {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TransportConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.userAgent = config.userAgent;
    this.timeout = config.timeout;
    this.retries = Math.max(0, config.retries);
    this.fetchImpl = config.fetch ?? fetch;
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async send(method: string, path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "User-Agent": this.userAgent,
      Accept: "application/json",
      ...options.headers,
    };
    let body: string | undefined;
    if (options.body !== undefined && options.body !== null) {
      body = JSON.stringify(decamelize(options.body));
      headers["Content-Type"] = "application/json";
    }

    const url = this.buildUrl(path, options.params);
    // A request is safe to replay if the method is idempotent, or it's a
    // POST carrying an Idempotency-Key (submit / rerun).
    const idempotent =
      IDEMPOTENT_METHODS.has(method) || (method === "POST" && hasIdempotencyKey(headers));

    let attempt = 0;
    for (;;) {
      try {
        const response = await this.fetchOnce(url, method, headers, body);
        // Retry transient statuses on idempotent requests only.
        if (idempotent && attempt < this.retries && RETRYABLE_STATUSES.has(response.status)) {
          const wait = retryAfterMs(response) ?? backoffMs(attempt);
          await drain(response);
          await sleep(wait);
          attempt += 1;
          continue;
        }
        return response;
      } catch (err) {
        // Network-level failure (DNS, reset, TLS). Our own timeout aborts
        // are AbortError and are NOT retried — the caller set that budget.
        const abort = err instanceof Error && err.name === "AbortError";
        if (idempotent && !abort && attempt < this.retries) {
          await sleep(backoffMs(attempt));
          attempt += 1;
          continue;
        }
        throw err;
      }
    }
  }

  private async fetchOnce(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Send a request, decode JSON to camelCase, throw on non-2xx. */
  async requestJson<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(method, path, options);
    if (response.status >= 400) {
      throw BatchApiError.fromResponse(response.status, await response.text());
    }
    if (response.status === 204) return null as T;
    const text = await response.text();
    if (!text) return null as T;
    return camelize<T>(JSON.parse(text));
  }

  /** Like {@link requestJson} but returns the raw body + content-type. */
  async requestBytes(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<{ body: Uint8Array; contentType: string }> {
    const response = await this.send(method, path, options);
    if (response.status >= 400) {
      throw BatchApiError.fromResponse(response.status, await response.text());
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { body: buffer, contentType: response.headers.get("Content-Type") ?? "" };
  }
}

/** Jittered exponential backoff: ~250ms · 2^attempt, ±20%, capped at 10s. */
function backoffMs(attempt: number): number {
  const base = Math.min(250 * 2 ** attempt, 10_000);
  return Math.round(base * (1 + (Math.random() * 2 - 1) * 0.2));
}

/** Best-effort drain of a discarded response body so the socket frees. */
async function drain(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // ignore — the body may already be closed.
  }
}
