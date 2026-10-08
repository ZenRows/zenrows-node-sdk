import { BatchTransport } from "../batch/transport.js";
import { pollUntil } from "../batch/waiters.js";
import { crawlError } from "./errors.js";
import type {
  Crawl,
  CrawlExportLine,
  CrawlList,
  CrawlOutputFormat,
  CrawlResult,
  CrawlStop,
  CrawlWithResults,
} from "./types.js";

const DEFAULT_CRAWL_API_URL = "https://api.zenrows.com/v1";

export interface CrawlClientConfig {
  /** Override the Crawl API base URL. Default `https://api.zenrows.com/v1`. */
  baseURL?: string;
  /** Retries for transient failures (429/502/503/504 + network errors) on idempotent requests. Default 3. */
  retries?: number;
}

export interface CreateCrawlOptions {
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
  /** Seconds before `WaiterTimeoutError`. Default 300. The crawl keeps running on timeout. */
  timeout?: number;
  /** Seconds before the first re-poll. Default 2; grows ×1.5 per poll. */
  pollInterval?: number;
  /** Cap on the poll interval in seconds. Default 15. */
  maxPollInterval?: number;
}

function contentIdOf(content: string | CrawlResult): string {
  if (typeof content === "string") return content;
  if (!content.content_url) {
    throw new Error(
      `getContent: result for ${content.url} has no content_url (content_status: ${content.content_status ?? "absent"})`,
    );
  }
  const id = content.content_url.split("/").pop();
  if (!id) throw new Error(`getContent: cannot read a content id from ${content.content_url}`);
  return id;
}

/**
 * Client for the Zenrows Crawl API: give it one start URL, read back the URLs behind it.
 * Usable standalone (`new ZenRowsCrawlClient(apiKey)`) or via `client.crawl` on a `ZenRows`
 * instance. A crawl runs asynchronously: `create()` returns at once, `wait()` polls until it
 * ends, and `iterResults()` / `download()` read what it kept.
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
    );
  }

  /**
   * Start a crawl. Sends only the fields you set. With an `idempotencyKey`, a retry returns the
   * crawl the first request created instead of starting another, and transient failures are
   * retried. A 429 `too_many_crawls` (the account has too many crawls running) throws
   * `ZenRowsCrawlError` with `retryAfter` set.
   */
  create(options: CreateCrawlOptions, opts: { idempotencyKey?: string } = {}): Promise<Crawl> {
    const body = {
      url: options.url,
      depth: options.depth,
      max_items: options.maxItems,
      max_pages: options.maxPages,
      include_patterns: options.includePatterns,
      exclude_patterns: options.excludePatterns,
      output_format: options.outputFormat,
    };
    return this.transport.requestJson("POST", "/crawls", {
      body,
      idempotencyKey: opts.idempotencyKey,
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

  /** Every crawl of the account, newest first, following `next_cursor`. */
  async *iterCrawls(options: { limit?: number } = {}): AsyncGenerator<Crawl> {
    let cursor: string | undefined;
    while (true) {
      const page = await this.list({ ...options, cursor });
      yield* page.crawls;
      cursor = page.next_cursor;
      if (!cursor) return;
    }
  }

  /**
   * Every URL the crawl kept, following `next_cursor` until it is null. Call it once the crawl
   * has ended (see `wait()`): on a running crawl it yields the URLs kept so far and returns.
   */
  async *iterResults(
    crawlId: string,
    options: { limit?: number } = {},
  ): AsyncGenerator<CrawlResult> {
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
   * One kept URL's page as fetched (HTML). Pass the content id, or the `CrawlResult` itself
   * (its `content_url` names the content; present once `content_status` is `fetched`).
   */
  async getContent(crawlId: string, content: string | CrawlResult): Promise<string> {
    const contentId = contentIdOf(content);
    const response = await this.transport.requestRaw(
      "GET",
      `/crawls/${encodeURIComponent(crawlId)}/contents/${encodeURIComponent(contentId)}`,
    );
    return response.text();
  }

  /**
   * Every result of the crawl in one download, one parsed line at a time (with the page when
   * the crawl has an `output_format`). On a running crawl it holds what was kept so far.
   */
  async *download(crawlId: string): AsyncGenerator<CrawlExportLine> {
    const response = await this.transport.requestRaw(
      "GET",
      `/crawls/${encodeURIComponent(crawlId)}/download`,
    );
    if (!response.body) return;
    const decoder = new TextDecoder();
    let buffered = "";
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
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
   * Poll until the crawl ends (any status but `running`) and return it, without results.
   * A `failed` crawl resolves too: read `error`. Throws `WaiterTimeoutError` after `timeout`
   * seconds; the crawl is not stopped.
   */
  async wait(crawlId: string, options: WaitForCrawlOptions = {}): Promise<Crawl> {
    // `limit: 1` keeps each poll cheap; the one result it reads is dropped.
    const ended = await pollUntil(() => this.get(crawlId, { limit: 1 }), {
      isDone: (c) => c.status !== "running",
      timeout: options.timeout ?? 300,
      initialInterval: options.pollInterval ?? 2,
      maxInterval: options.maxPollInterval ?? 15,
    });
    const { results: _results, next_cursor: _cursor, ...crawl } = ended;
    return crawl;
  }
}
