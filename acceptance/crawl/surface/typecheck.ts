// Compiled by the x-node-tsc check in a fresh `tsc --strict` project; never run.
import {
  type Crawl,
  type CrawlDownload,
  type CrawlList,
  type CrawlResult,
  type CrawlStop,
  type CrawlWithResults,
  type CreateCrawlParams,
  ZenRows,
  ZenRowsCrawlClient,
  ZenRowsCrawlError,
} from "zenrows";

const client = new ZenRows("k");
const standalone = new ZenRowsCrawlClient("k", {
  baseURL: "https://api.zenrows.com/v1",
  retries: 3,
  timeout: 30,
});

export async function main(): Promise<void> {
  const params: CreateCrawlParams = {
    url: "https://example.com/",
    depth: 1,
    maxItems: 5,
    maxPages: 10,
    includePatterns: ["/p/"],
    outputFormat: "html",
  };
  const c: Crawl = await client.crawl.create(params, { idempotencyKey: "k" });
  // depth is optional: left out, the crawl has no depth limit and the response omits it.
  const unbounded: Crawl = await client.crawl.create({ url: "https://example.com/" });
  const depth: number | undefined = unbounded.depth;
  const w: Crawl = await standalone.wait(c.crawl_id, { timeout: 1 });
  const g: CrawlWithResults = await client.crawl.get(w.crawl_id, { limit: 2 });
  const next: string | null = g.next_cursor;
  const l: CrawlList = await client.crawl.list({ limit: 2 });
  const listNext: string | undefined = l.next_cursor;
  for await (const r of client.crawl.results(c.crawl_id)) {
    const result: CrawlResult = r;
    const html: string = await client.crawl.content(c.crawl_id, result);
    console.log(html.length);
  }
  const d: CrawlDownload = await client.crawl.download(c.crawl_id);
  for await (const line of d.lines) console.log(line.url);
  const s: CrawlStop = await client.crawl.stop(c.crawl_id);
  try {
    await client.crawl.get("x");
  } catch (e) {
    if (e instanceof ZenRowsCrawlError) {
      const code: string | undefined = e.code;
      const status: number = e.status;
      console.log(code, status);
    }
  }
  console.log(next, listNext, s.status, depth);
}
