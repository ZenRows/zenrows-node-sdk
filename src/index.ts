import fastq from "fastq";
import fetchRetry from "fetch-retry";
import packageJson from "../package.json" with { type: "json" };
import { ZenRowsBatchClient } from "./batch/client.js";
import { type CrawlClientConfig, ZenRowsCrawlClient } from "./crawl/client.js";
import {
  type PreparedDomainStatus,
  checkDomain,
  preparedDomainsRequest,
} from "./extract/prepared-domains.js";
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
export {
  type PreparedDomainProblem,
  type PreparedDomainStatus,
  ZenRowsPreparedDomainError,
} from "./extract/prepared-domains.js";
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

let fallbackDeprecationWarned = false;

/** Warns once per process that `fallbackToAutoparse` no longer does anything. */
function warnFallbackDeprecated(): void {
  if (fallbackDeprecationWarned || typeof process === "undefined" || !process.emitWarning) return;
  fallbackDeprecationWarned = true;
  process.emitWarning(
    "fallbackToAutoparse is deprecated and has no effect: extract() no longer retries with " +
      "autoparse. On a 403 REQS007, check `reason` in the problem body; for " +
      "domain_not_prepared, prepare the domain with prepareDomain().",
    { type: "DeprecationWarning", code: "ZENROWS_FALLBACK_TO_AUTOPARSE" },
  );
}

interface ClientConfig {
  concurrency?: number;
  /**
   * Retries for `fetch()` and `extract()` after a 429, 502, 503 or 504, a 422 other than
   * `no_data_extracted`, or a failure before the request reached the server. An integer of 0 or
   * more; default 2; 0 turns retries off. A reset after the request was sent, a timeout or an
   * abort is never retried: the server may still finish the request and charge it. `post()` is
   * never retried, whatever its headers: the API does not dedupe on `Idempotency-Key`. No status
   * is retried when the request sets `original_status`, and no status listed in
   * `allowed_status_codes` is: that status comes from the target site.
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
  /** @deprecated Autoparse is deprecated. Use `client.extract()` for structured data,
   * or `css_extractor`. */
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
   * Extract works on any prepared domain (you can prepare one yourself with
   * `POST /v1/extract/prepared-domains`), with any active API key. A 403 with
   * `code: "REQS007"` means Extract can't extract this page. Check `reason` in the problem
   * body (`(await response.json()).reason`) when present; older responses may not carry it:
   *
   * - `domain_not_prepared`: prepare the domain with `prepareDomain()`, poll
   *   `preparedDomainStatus()` until `status` is `"ready"`, then retry.
   * - `page_not_recognised`: the domain is served, but this page isn't one Extract extracts
   *   (a home, search, login or category page). Try a product, article or listing page, or
   *   retry once in a few minutes. Preparing the domain again changes nothing.
   * - `domain_not_enabled`: preparing doesn't help. Use `css_extractor`, or contact support.
   *
   * The legacy domain-not-enabled error is a 402 with `code: "AUTH010"`. Both error
   * responses are returned to you as is, in one request; extract() never retries them with
   * autoparse.
   *
   * A 422 with `code: "no_data_extracted"` means Extract knows this kind of page but
   * found no data on it. It is not charged and is never retried; check it with
   * `isNoDataExtracted(response)`.
   */
  public async extract(
    url: string,
    config?: ZenRowsConfig & {
      extract?: ExtractMode;
      /** @deprecated Has no effect: extract() no longer retries with autoparse. Passing
       * `true` emits a `DeprecationWarning` once per process. */
      fallbackToAutoparse?: boolean;
      adaptiveStealth?: boolean;
    },
    opts: { headers?: Headers } = {},
  ): Promise<Response> {
    const {
      extract = "auto",
      fallbackToAutoparse = false,
      adaptiveStealth = true,
      ...rest
    } = config ?? {};
    if (fallbackToAutoparse) warnFallbackDeprecated();
    const mode = extractWireMode(rest, adaptiveStealth);
    return this.fetch(url, { ...rest, extract, mode }, opts);
  }

  /**
   * Submit `domain` for Extract preparation (`POST /v1/extract/prepared-domains`) and return
   * the parsed status object the API answers with `202`: `domain`, `status` (`"preparing"`,
   * `"ready"` or `"failed"`), `state`, `submitted_at`, `updated_at`.
   *
   * `domain` is the domain without a scheme. `exampleUrls` are 1 to 5 example URLs on that
   * domain. One works; we recommend 3 or more of the same page type (e.g. 3 product pages),
   * because Extract compares pages of one type to check the fields it found and fill in fields
   * one page is missing. Several page types can share the 5 (e.g. 3 product pages + 2
   * search-result pages). Submitting a domain that is already prepared returns its current
   * status instead of starting a new run.
   *
   * Preparation takes minutes. This method does not wait for it: call
   * `preparedDomainStatus(domain)` until `status` is no longer `"preparing"`. These endpoints
   * don't fetch pages and cost no credits.
   *
   * Rejects with a `TypeError` for an empty `domain`, before any request, and with
   * `ZenRowsPreparedDomainError` on a non-2xx answer, for example 400 `invalid_argument`, 409 `in_progress`, 429 `out_of_allowance` or 503 `overloaded` /
   * `disabled`.
   */
  public async prepareDomain(domain: string, exampleUrls: string[]): Promise<PreparedDomainStatus> {
    checkDomain(domain);
    return preparedDomainsRequest(`${API_URL}extract/prepared-domains`, {
      method: "POST",
      headers: { ...this.preparedDomainsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ domain, example_urls: exampleUrls }),
    });
  }

  /**
   * Read the preparation status of `domain` (`GET /v1/extract/prepared-domains/{domain}`)
   * and return the parsed status object. `status` is `"preparing"`, `"ready"` or `"failed"`;
   * a failed preparation carries a `failure` with `code`, `detail` and `slot_consumed`.
   *
   * Rejects with a `TypeError` for an empty `domain`, before any request, and with
   * `ZenRowsPreparedDomainError` on a non-2xx answer, for example 404 `not_found` when your
   * account never submitted `domain`.
   */
  public async preparedDomainStatus(domain: string): Promise<PreparedDomainStatus> {
    checkDomain(domain);
    return preparedDomainsRequest(
      `${API_URL}extract/prepared-domains/${encodeURIComponent(domain)}`,
      { method: "GET", headers: this.preparedDomainsHeaders() },
    );
  }

  private preparedDomainsHeaders(): Record<string, string> {
    return { "X-API-Key": this.apiKey, "User-Agent": `zenrows/${packageJson.version} node` };
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

    // A POST, or a body that cannot be sent again, goes out once: it is not safe to send twice.
    const eligible = isRetryEligible(method, fetchOptions.body);
    const { retryOn, retryDelay } = retryPolicy({
      retries: eligible ? this.clientConfig.retries ?? DEFAULT_RETRIES : 0,
      // A status the target site sent (original_status, allowed_status_codes) is not retried.
      params: config,
      retryMaxWait: this.clientConfig.retryMaxWait ?? DEFAULT_RETRY_MAX_WAIT_SECONDS,
      retryBudget: this.clientConfig.retryBudget ?? DEFAULT_RETRY_BUDGET_SECONDS,
    });
    const response = await this.fetchWithRetry(`${API_URL}?${params.toString()}`, {
      ...fetchOptions,
      retryOn,
      retryDelay,
    });

    return response;
  }
}
