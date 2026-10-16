import type { Extensible } from "../batch/types.js";

/** `running` until the crawl ends; the other three are terminal. */
export type CrawlStatus = "running" | "completed" | "stopped" | "failed";
/**
 * What ended a crawl early: a limit (`status: completed`) or `stop()` (`status: stopped`). Absent on a
 * crawl that stopped because the account ran out of credits or the API key hit a credit cap: that one
 * carries `error` instead.
 */
export type CrawlStopReason = "max_items" | "max_pages" | "user";
/**
 * Why a crawl failed (`status: failed`), or why it stopped on credits: `insufficient_credits` and
 * `api_key_cap_reached` come with `status: stopped`, and the pages fetched before that stay readable.
 * `seed_unreachable` covers a start page that could not be fetched, was blocked, or came back empty,
 * with no visible text and no link. `no_items_found` means that, in a crawl that runs Extract, Extract
 * read the start page and found no data on it. A crawl that returns nothing for any other reason is not
 * a failure: it ends `completed` with no results.
 */
export type CrawlErrorCode =
  | "insufficient_credits"
  | "api_key_cap_reached"
  | "seed_unreachable"
  | "domain_not_allowed"
  | "no_items_found"
  | "internal_error";
/** Where a kept URL's page stands, when the crawl has an `output_format`. */
export type CrawlContentStatus = "pending" | "fetched" | "failed";
/** Return each kept URL's page, in this format. Absent means URLs only. */
export type CrawlOutputFormat = "html" | "markdown";
/** How a crawl finds the URLs it follows on each page it walks. */
export type CrawlDiscoveryStrategy = "links";

export interface CrawlCoverage {
  pages_fetched: number;
  pages_failed: number;
  items_found: number;
}

/**
 * Why a crawl failed, or why it stopped because the account ran out of credits or the API key hit a
 * credit cap. Present when `status` is `failed`, and when it is `stopped` with `code`
 * `insufficient_credits` or `api_key_cap_reached`. Part of the crawl, not an error response.
 */
export interface CrawlRunError {
  code: Extensible<CrawlErrorCode>;
  detail: string;
}

export interface Crawl {
  crawl_id: string;
  status: Extensible<CrawlStatus>;
  url: string;
  /** The depth limit the crawl was created with. Absent when it was created without one: no depth limit. */
  depth?: number;
  max_items: number;
  max_pages: number;
  coverage: CrawlCoverage;
  created_at: string;
  stop_reason?: Extensible<CrawlStopReason>;
  error?: CrawlRunError;
  include_patterns?: string[];
  exclude_patterns?: string[];
  output_format?: Extensible<CrawlOutputFormat>;
  /**
   * The strategies the crawl finds URLs with. `["links"]` when the create left it out.
   * Absent when the server does not send the field.
   */
  discovery?: Extensible<CrawlDiscoveryStrategy>[];
  duplicates_removed?: number;
  /** Absent while the crawl runs. */
  finished_at?: string;
}

export interface CrawlResult {
  url: string;
  content_status?: Extensible<CrawlContentStatus>;
  /** The page's path, e.g. `/v1/crawls/c_x/contents/ct_y`. Present when `content_status` is `fetched`. */
  content_url?: string;
}

export interface CrawlWithResults extends Crawl {
  results: CrawlResult[];
  /** Never null while the crawl runs; null once it ended and this page holds its last URLs. */
  next_cursor: string | null;
}

export interface CrawlList {
  crawls: Crawl[];
  /** Absent on the last page. */
  next_cursor?: string;
}

/** What `stop()` returns: where the crawl stands, without counts. */
export interface CrawlStop {
  crawl_id: string;
  status: Extensible<CrawlStatus>;
  stop_reason?: Extensible<CrawlStopReason>;
  error?: CrawlRunError;
  finished_at?: string;
}

/** One line of a crawl's download. */
export interface CrawlExportLine {
  url: string;
  content_status?: Extensible<CrawlContentStatus>;
  /** The page, present when `content_status` is `fetched`: HTML text, or an object for a JSON crawl. */
  content?: string | Record<string, unknown>;
}

/** What `download()` returns. */
export interface CrawlDownload {
  /**
   * The crawl's status when the file was read (`X-Crawl-Status`; undefined without it).
   * `running` means a later download may hold more lines.
   */
  status: Extensible<CrawlStatus> | undefined;
  lines: AsyncIterable<CrawlExportLine>;
}
