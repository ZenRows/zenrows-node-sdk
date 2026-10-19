import fastq from "fastq";
import fetchRetry from "fetch-retry";
import packageJson from "../package.json" with { type: "json" };
import { ZenRowsBatchClient } from "./batch/client.js";
import { type CrawlClientConfig, ZenRowsCrawlClient } from "./crawl/client.js";
import {
  DEFAULT_RETRIES,
  DEFAULT_RETRY_BUDGET_SECONDS,
  DEFAULT_RETRY_MAX_WAIT_SECONDS,
  isRetryEligible,
  retryPolicy,
  validateRetryOptions,
} from "./retry.js";

export * from "./batch/client.js";
export * from "./batch/errors.js";
export * from "./batch/estimate.js";
export * from "./batch/schedule.js";
export * from "./batch/waiters.js";
export * from "./batch/download.js";
export type * from "./batch/types.js";
export * from "./crawl/client.js";
export { CRAWL_NOT_ENABLED_CODE, ZenRowsCrawlError } from "./crawl/errors.js";
export type * from "./crawl/types.js";
export { isNoDataExtracted } from "./retry.js";

const API_URL = "https://api.zenrows.com/v1/";

type HttpMethods = "GET" | "POST" | "PUT";

/** Extract mode — see https://docs.zenrows.com/extract/setup for what each mode returns. */
export type ExtractMode = "auto" | "native" | "standard";

/** True when the caller forces a value the API reads as on: `true` or the string "true". */
function isOn(value: unknown): boolean {
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

/** The wire `mode` extract() sends. A `mode` the caller set is kept as given. Otherwise
 * Adaptive Stealth Mode (`"auto"`) is added when enabled, except when the caller forces
 * `js_render` or `premium_proxy`: the API rejects either combined with `mode=auto`. */
function extractWireMode(config: ZenRowsConfig, adaptiveStealth: boolean): "auto" | undefined {
  if (config.mode !== undefined) return config.mode;
  if (!adaptiveStealth) return undefined;
  if (isOn(config.js_render) || isOn(config.premium_proxy)) return undefined;
  return "auto";
}

/** True when a response says Extract can't serve the target domain yet: a 403
 * carrying REQS007 (domain not prepared yet) or a 402 carrying the legacy
 * domain-not-enabled code AUTH010. Any other 402/403 (no credits, bad key) is
 * not. Reads via `.clone()` so the original response body is left unconsumed
 * for the caller. */
async function isExtractDomainNotReady(response: Response): Promise<boolean> {
  const expected =
    response.status === 403 ? "REQS007" : response.status === 402 ? "AUTH010" : undefined;
  if (!expected) return false;
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body?.code === "string" && body.code.toUpperCase() === expected;
  } catch {
    return false;
  }
}

interface ClientConfig {
  concurrency?: number;
  /**
   * Retries for `fetch()`, `extract()` and `post()` after a 429, 502, 503 or 504, a 422 other
   * than `no_data_extracted`, or a failure before the request reached the server. An integer of
   * 0 or more; default 2; 0 turns retries off. A reset after the request was sent, a timeout or
   * an abort is never retried: the server may still finish the request and charge it. `post()`
   * is retried only when its headers carry an `Idempotency-Key`.
   */
  retries?: number;
  /** The longest one random wait may be, in seconds (greater than 0). Default 30. It never caps a `Retry-After`. */
  retryMaxWait?: number;
  /** No retry starts after this many seconds since the first try started (greater than 0). Default 90. */
  retryBudget?: number;
  /** Config for `client.crawl`: its own `baseURL`, `retries` and `timeout`. */
  crawl?: CrawlClientConfig;
}
export interface ZenRowsConfig {
  /** Set to "auto" to enable Adaptive Stealth Mode — Zenrows starts with the cheapest
   * viable request configuration and escalates to js_render/premium_proxy only when the
   * target needs it, billing only for the configuration that succeeds. */
  mode?: "auto";
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

/** When a logical call's first try started. Shared by the requests of one call (see `extract()`). */
interface CallClock {
  startedAt?: number;
}

export class ZenRows {
  readonly apiKey: string;
  readonly clientConfig: ClientConfig;
  readonly queue;
  readonly fetchWithRetry;
  /** Client for the Batch API (async job/run/task model) — see `./batch.ts`. */
  readonly batch: ZenRowsBatchClient;
  /** Client for the Crawl API (new; one start URL in, the URLs behind it out). See `./crawl/client.ts`. */
  readonly crawl: ZenRowsCrawlClient;

  constructor(apiKey: string, clientConfig: ClientConfig = {}) {
    validateRetryOptions(clientConfig);
    this.apiKey = apiKey;
    this.clientConfig = clientConfig;
    this.batch = new ZenRowsBatchClient(apiKey);
    this.crawl = new ZenRowsCrawlClient(apiKey, clientConfig.crawl);

    this.queue = fastq.promise(this, this.worker, this.clientConfig.concurrency ?? 5);

    // The retry policy is per request (see `worker`), so this only wraps fetch.
    this.fetchWithRetry = fetchRetry(fetch);
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
   * Fetch a URL and run it through Extract — Zenrows' AI-powered structured extraction.
   * `mode` defaults to `"auto"`; pass `"native"` or `"standard"` to pick a
   * different extraction contract. This is a thin, typed wrapper over `fetch()` with the
   * `extract` param set — no separate endpoint or auth.
   *
   * Also sends Adaptive Stealth Mode (`mode: "auto"`) by default, so a target that needs
   * `js_render`/`premium_proxy` gets escalated automatically instead of failing with
   * REQS002. It is skipped when the config sets `js_render` or `premium_proxy` (the API
   * rejects either combined with Adaptive Stealth Mode) or its own `mode`. Pass
   * `adaptiveStealth: false` to turn it off entirely.
   *
   * Extract works on any domain Zenrows has prepared, with any active API key. On a
   * domain that isn't prepared yet, `extract=auto` returns a 403 with `code: "REQS007"`
   * (prepare it with `POST /v1/extract/prepared-domains`); the legacy domain-not-enabled
   * error is a 402 with `code: "AUTH010"`. By default this method catches either and
   * retries once with `autoparse: true` instead of returning the error response — pass
   * `fallbackToAutoparse: false` to disable that and get the raw error response back.
   *
   * A 422 with `code: "no_data_extracted"` means Extract knows this kind of page but
   * found no data on it. It is not charged and is never retried; check it with
   * `isNoDataExtracted(response)`.
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
    const mode = extractWireMode(rest, adaptiveStealth);
    const { headers = {} } = opts;
    // One retry budget for the whole call: the fallback reuses the first request's start time.
    const clock: CallClock = {};
    const response = await this.queue.push({
      url,
      config: { ...rest, extract, mode },
      headers,
      clock,
    });

    if (extract === "auto" && fallbackToAutoparse && (await isExtractDomainNotReady(response))) {
      return this.queue.push({ url, config: { ...rest, autoparse: true, mode }, headers, clock });
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
    clock = {},
  }: {
    url: string;
    method?: HttpMethods;
    config?: ZenRowsConfig;
    headers: Headers;
    data?: unknown;
    clock?: CallClock;
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

    // A request that is not safe to send twice (a POST without an Idempotency-Key) is sent once.
    const eligible = isRetryEligible(method, finalHeaders, fetchOptions.body);
    clock.startedAt ??= Date.now();
    const { retryOn, retryDelay } = retryPolicy({
      retries: eligible ? this.clientConfig.retries ?? DEFAULT_RETRIES : 0,
      retryMaxWait: this.clientConfig.retryMaxWait ?? DEFAULT_RETRY_MAX_WAIT_SECONDS,
      retryBudget: this.clientConfig.retryBudget ?? DEFAULT_RETRY_BUDGET_SECONDS,
      startedAt: clock.startedAt,
    });
    const response = await this.fetchWithRetry(`${API_URL}?${params.toString()}`, {
      ...fetchOptions,
      retryOn,
      retryDelay,
    });

    return response;
  }
}
