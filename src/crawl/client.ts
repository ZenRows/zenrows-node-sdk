import { BatchTransport } from "../batch/transport.js";
import { crawlError } from "./errors.js";
import type {
  Crawl,
  CrawlDownload,
  CrawlExportLine,
  CrawlList,
  CrawlOutputFormat,
  CrawlResult,
  CrawlStop,
  CrawlWithResults,
} from "./types.js";

const DEFAULT_CRAWL_API_URL = "https://api.zenrows.com/v1";
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_WAIT_TIMEOUT_SECONDS = 600;
const POLL_INTERVAL_SECONDS = 2;
const MAX_POLL_INTERVAL_SECONDS = 15;
const POLL_BACKOFF = 1.5;
// 429 `too_many_crawls` is a capacity limit: a retry only waits for a slot the caller may never get.
const CREATE_RETRY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

export interface CrawlClientConfig {
  /** Override the Crawl API base URL. Default `https://api.zenrows.com/v1`. */
  baseURL?: string;
  /** Retries for transient failures (502/503/504, network errors, 429 on reads) on idempotent requests. Default 3. */
  retries?: number;
  /** Seconds each HTTP request may take. Default 30. Does not limit reading a `download()` body. */
  timeout?: number;
}

export interface CreateCrawlParams {
  /** The page the crawl starts from: an absolute public `http`/`https` URL. */
  url: string;
  /** Link hops to follow from the start URL, 1–100000. */
  depth: number;
  /** Stop once this many URLs are kept. Server default 10. */
  maxItems?: number;
  /** Stop once this many pages are fetched; bounds the cost. Server default 10. */
  maxPages?: number;
  /** Keep a URL only if it contains at least one of these substrings. */
  includePatterns?: string[];
  /** Drop a URL that contains any of these substrings, even if it matches an include pattern. */
  excludePatterns?: string[];
  /** Also fetch each kept URL's page. Absent means URLs only. */
  outputFormat?: CrawlOutputFormat;
}

export interface WaitForCrawlOptions {
  /** Seconds to poll before returning the crawl as it stands. Default 600. */
  timeout?: number;
}

function contentIdOf(content: string | CrawlResult): string {
  let ref: string;
  if (typeof content === "string") ref = content;
  else if (content.content_url) ref = content.content_url;
  else {
    throw new TypeError(
      `content: result for ${content.url} has no content_url (content_status: ${content.content_status ?? "absent"})`,
    );
  }
  const id = ref.split("/").pop();
  if (!id) throw new TypeError(`content: cannot read a content id from ${ref}`);
  return id;
}

async function* ndjsonLines(
  body: AsyncIterable<Uint8Array> | null,
): AsyncGenerator<CrawlExportLine> {
  if (!body) return;
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of body) {
    buffered += decoder.decode(chunk, { stream: true });
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) yield JSON.parse(line) as CrawlExportLine;
      newline = buffered.indexOf("\n");
    }
  }
  const last = (buffered + decoder.decode()).trim();
  if (last) yield JSON.parse(last) as CrawlExportLine;
}

/**
 * Client for the Zenrows Crawl API (new): give it one start URL, read back the URLs behind it.
 * Usable standalone (`new ZenRowsCrawlClient(apiKey)`) or via `client.crawl` on a `ZenRows`
 * instance. A crawl runs asynchronously: `create()` returns at once, `wait()` polls until it
 * ends, and `results()` / `download()` read what it kept.
 * Crawl is still evolving: new features are coming, limits may be tuned, and the changelog announces each change.
 */
export class ZenRowsCrawlClient {
  readonly apiKey: string;
  private readonly transport: BatchTransport;

  constructor(apiKey: string, config: CrawlClientConfig = {}) {
    this.apiKey = apiKey;
    this.transport = new BatchTransport(
      (config.baseURL ?? DEFAULT_CRAWL_API_URL).replace(/\/+$/, ""),
      apiKey,
      config.retries,
      crawlError,
      (config.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
    );
  }

  /**
   * Start a crawl. Sends only the fields you set. With an `idempotencyKey`, a retry returns the
   * crawl the first request created instead of starting another, and 5xx and network failures
   * are retried. A 429 `too_many_crawls` is never retried: it throws `ZenRowsCrawlError` with
   * `retryAfter` set.
   */
  create(params: CreateCrawlParams, opts: { idempotencyKey?: string } = {}): Promise<Crawl> {
    const body = {
      url: params.url,
      depth: params.depth,
      max_items: params.maxItems,
      max_pages: params.maxPages,
      include_patterns: params.includePatterns,
      exclude_patterns: params.excludePatterns,
      output_format: params.outputFormat,
    };
    return this.transport.requestJson("POST", "/crawls", {
      body,
      idempotencyKey: opts.idempotencyKey,
      retryStatuses: CREATE_RETRY_STATUSES,
    });
  }

  /** Read a crawl's status, coverage and one page of results (`limit` 1–10000, default 1000). */
  get(
    crawlId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<CrawlWithResults> {
    return this.transport.requestJson("GET", `/crawls/${encodeURIComponent(crawlId)}`, {
      query: options,
    });
  }

  /** One page of the account's crawls, newest first (`limit` 1–100, default 20). */
  list(options: { cursor?: string; limit?: number } = {}): Promise<CrawlList> {
    return this.transport.requestJson("GET", "/crawls", { query: options });
  }

  /**
   * Every URL the crawl kept, following `next_cursor` (`limit` is the page size). On a running
   * crawl it yields the URLs kept so far and returns at the first empty page; it does not poll.
   * Call `wait()` first to read every result.
   */
  async *results(crawlId: string, options: { limit?: number } = {}): AsyncGenerator<CrawlResult> {
    let cursor: string | undefined;
    while (true) {
      const page = await this.get(crawlId, { ...options, cursor });
      yield* page.results;
      // A running crawl's cursor is never null; an empty page means nothing more is kept yet.
      if (page.next_cursor === null || page.results.length === 0) return;
      cursor = page.next_cursor;
    }
  }

  /** Stop a running crawl. Idempotent: a crawl that already ended answers as it ended. */
  stop(crawlId: string): Promise<CrawlStop> {
    return this.transport.requestJson("POST", `/crawls/${encodeURIComponent(crawlId)}/stop`);
  }

  /**
   * One kept URL's page as fetched (HTML). Pass the content id, a `content_url`, or the
   * `CrawlResult` itself (its `content_url` is present once `content_status` is `fetched`).
   * Throws `TypeError` when no content id can be read.
   */
  async content(crawlId: string, content: string | CrawlResult): Promise<string> {
    return this.transport.requestText(
      "GET",
      `/crawls/${encodeURIComponent(crawlId)}/contents/${encodeURIComponent(contentIdOf(content))}`,
    );
  }

  /**
   * Every result of the crawl in one download: its `status` and the parsed lines (with the
   * page when the crawl has an `output_format`). On a running crawl, `status` is `running` and
   * the lines hold only what was kept so far.
   */
  async download(crawlId: string): Promise<CrawlDownload> {
    const response = await this.transport.requestRaw(
      "GET",
      `/crawls/${encodeURIComponent(crawlId)}/download`,
    );
    return {
      status: response.headers.get("X-Crawl-Status") ?? undefined,
      lines: ndjsonLines(response.body as AsyncIterable<Uint8Array> | null),
    };
  }

  /**
   * Poll until the crawl ends (any status but `running`) or `timeout` seconds pass, and return
   * it, without results. A `failed` crawl resolves too: read `error`. On timeout the crawl is
   * returned with status `running` and keeps running.
   */
  async wait(crawlId: string, options: WaitForCrawlOptions = {}): Promise<Crawl> {
    const deadline = Date.now() + (options.timeout ?? DEFAULT_WAIT_TIMEOUT_SECONDS) * 1000;
    let interval = POLL_INTERVAL_SECONDS;
    let latest: CrawlWithResults;
    while (true) {
      // `limit: 1` keeps each poll cheap; the one result it reads is dropped.
      latest = await this.get(crawlId, { limit: 1 });
      const remaining = deadline - Date.now();
      if (latest.status !== "running" || remaining <= 0) break;
      const jitter = 0.8 + Math.random() * 0.4;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(interval * 1000 * jitter, remaining)),
      );
      interval = Math.min(interval * POLL_BACKOFF, MAX_POLL_INTERVAL_SECONDS);
    }
    const { results: _results, next_cursor: _cursor, ...crawl } = latest;
    return crawl;
  }
}
