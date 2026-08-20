import fastq from "fastq";
import fetchRetry from "fetch-retry";
import packageJson from "../package.json" with { type: "json" };
import { ZenRowsBatchClient } from "./batch/client.js";

export * from "./batch/client.js";
export * from "./batch/errors.js";
export * from "./batch/estimate.js";
export * from "./batch/schedule.js";
export * from "./batch/waiters.js";
export * from "./batch/download.js";
export type * from "./batch/types.js";

const API_URL = "https://api.zenrows.com/v1/";

type HttpMethods = "GET" | "POST" | "PUT";

/** Extract mode — see https://docs.zenrows.com for what each mode returns. */
export type ExtractMode = "auto" | "native" | "standard";

/** True when a response's JSON error envelope carries the Extract
 * domain-not-enabled code (AUTH010). Reads via `.clone()` so the original
 * response body is left unconsumed for the caller. */
async function isAuth010(response: Response): Promise<boolean> {
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body?.code === "string" && body.code.toUpperCase() === "AUTH010";
  } catch {
    return false;
  }
}

interface ClientConfig {
  concurrency?: number;
  retries?: number;
}
export interface ZenRowsConfig {
  autoparse?: boolean;
  css_extractor?: string;
  js_render?: boolean;
  premium_proxy?: boolean;
  proxy_country?: string;
  wait_for?: string;
  wait?: number;
  block_resources?: string;
  window_width?: number;
  window_height?: number;
  device?: string;
  original_status?: boolean;
  custom_headers?: boolean;
  [x: string]: unknown;
}

interface Headers {
  [x: string]: string;
}

export class ZenRows {
  readonly apiKey: string;
  readonly clientConfig: ClientConfig;
  readonly queue;
  readonly fetchWithRetry;
  /** Client for the Batch API (async job/run/task model) — see `./batch.ts`. */
  readonly batch: ZenRowsBatchClient;

  constructor(apiKey: string, clientConfig: ClientConfig = {}) {
    this.apiKey = apiKey;
    this.clientConfig = clientConfig;
    this.batch = new ZenRowsBatchClient(apiKey);
    const retries = this.clientConfig.retries ?? 0;

    this.queue = fastq.promise(this, this.worker, this.clientConfig.concurrency ?? 5);

    this.fetchWithRetry = fetchRetry(fetch, {
      retryDelay: (attempt) => 2 ** attempt * 1000,
      // retryOn: [422, 503, 504],
      retryOn: (attempt, error, response) => {
        if (attempt >= retries) {
          return false;
        }

        if (
          error !== null ||
          response?.status === 422 ||
          response?.status === 503 ||
          response?.status === 504
        ) {
          return true;
        }

        return false;
      },
    });
  }

  /**
   * Fetch a URL through Zenrows — the main page-scraping product. This is the primary entry
   * point; `get()` remains as a deprecated alias for existing callers.
   */
  public fetch(
    url: string,
    config?: ZenRowsConfig,
    { headers = {} }: { headers?: Headers } = {},
  ): Promise<Response> {
    return this.queue.push({ url, config, headers });
  }

  /** @deprecated Use `fetch()` instead. Kept for backward compatibility. */
  public get(
    url: string,
    config?: ZenRowsConfig,
    opts: { headers?: Headers } = {},
  ): Promise<Response> {
    return this.fetch(url, config, opts);
  }

  /**
   * Fetch a URL and run it through Extract — Zenrows' AI-powered structured extraction
   * (beta). `mode` defaults to `"auto"`; pass `"native"` or `"standard"` to pick a
   * different extraction contract. This is a thin, typed wrapper over `fetch()` with the
   * `extract` param set — no separate endpoint or auth.
   *
   * Also sends Adaptive Stealth Mode (`mode: "auto"`) by default, so a target that needs
   * `js_render`/`premium_proxy` gets escalated automatically instead of failing with
   * REQS002 — pass `adaptiveStealth: false` to disable that and set `js_render`/
   * `premium_proxy` yourself.
   *
   * `extract=auto` is a domain-gated open beta: when the target domain isn't enabled yet,
   * the API returns a 402 with `code: "AUTH010"`. By default this method catches that and
   * retries once with `autoparse: true` instead of returning the error response — pass
   * `fallbackToAutoparse: false` to disable that and get the raw AUTH010 response back.
   */
  public async extract(
    url: string,
    config?: ZenRowsConfig & {
      extract?: ExtractMode;
      fallbackToAutoparse?: boolean;
      adaptiveStealth?: boolean;
    },
    opts: { headers?: Headers } = {},
  ): Promise<Response> {
    const {
      extract = "auto",
      fallbackToAutoparse = true,
      adaptiveStealth = true,
      ...rest
    } = config ?? {};
    const mode = adaptiveStealth ? "auto" : undefined;
    const response = await this.fetch(url, { ...rest, extract, mode }, opts);

    if (
      response.status === 402 &&
      extract === "auto" &&
      fallbackToAutoparse &&
      (await isAuth010(response))
    ) {
      return this.fetch(url, { ...rest, autoparse: true, mode }, opts);
    }

    return response;
  }

  public post(
    url: string,
    config?: ZenRowsConfig,
    { headers = {}, data = {} }: { headers?: Headers; data?: unknown } = {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  ): Promise<Response> {
    const normalizedHeaders = Object.keys(headers).reduce(
      (acc: { [key: string]: string }, key: string) => {
        const value = headers[key];
        if (value !== undefined) {
          if (key.toLowerCase() === "content-type") {
            acc["Content-Type"] = value;
          } else {
            acc[key] = value;
          }
        }
        return acc;
      },
      {},
    );

    return this.queue.push({
      url,
      method: "POST",
      config,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...normalizedHeaders,
      },
      data,
    });
  }

  private async worker({
    url,
    method = "GET",
    config,
    headers,
    data,
  }: {
    url: string;
    method?: HttpMethods;
    config?: ZenRowsConfig;
    headers: Headers;
    data?: unknown;
  }): Promise<Response> {
    const params = new URLSearchParams({
      url,
      apikey: this.apiKey,
    });

    if (config) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
    }

    if (headers && Object.keys(headers).length) {
      params.append("custom_headers", "true");
    }

    const finalHeaders = {
      "User-Agent": `zenrows/${packageJson.version} node`,
      ...headers,
    };

    const fetchOptions: RequestInit = {
      method,
      headers: finalHeaders,
    };

    if (method === "POST" && data) {
      if (typeof data === "object") {
        fetchOptions.body = JSON.stringify(data);
      } else {
        fetchOptions.body = String(data);
      }
    }

    const response = await this.fetchWithRetry(`${API_URL}?${params.toString()}`, fetchOptions);

    return response;
  }
}
