// End-to-end test against a live Crawl API. Skipped unless ZENROWS_API_KEY and
// ZENROWS_E2E_CRAWL_URL are set, so `pnpm test` stays hermetic. Run with `pnpm test:e2e`.
import { beforeAll, describe, expect, test } from "vitest";
import { ZenRowsCrawlClient } from "../../src/crawl/client";
import { ZenRowsCrawlError } from "../../src/crawl/errors";
import type { Crawl, CrawlResult } from "../../src/crawl/types";
import { server } from "../_setup";

const apiKey = process.env.ZENROWS_API_KEY;
const baseURL = process.env.ZENROWS_CRAWL_BASE_URL || "https://api.zenrows.com/v1";
const startURL = process.env.ZENROWS_E2E_CRAWL_URL;
const include = process.env.ZENROWS_E2E_CRAWL_INCLUDE || undefined;

// Other runs on the same account share its active crawl slots; wait for one to free.
const CREATE_RETRY_BUDGET_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!apiKey || !startURL)("Crawl e2e", () => {
  const client = new ZenRowsCrawlClient(apiKey ?? "", { baseURL });
  let ended: Crawl;
  let results: CrawlResult[];

  beforeAll(async () => {
    // The shared msw server intercepts fetch for the unit tests; this file talks to the real API.
    server.close();

    const deadline = Date.now() + CREATE_RETRY_BUDGET_MS;
    let created: Crawl;
    while (true) {
      try {
        created = await client.create({
          url: startURL ?? "",
          depth: 1,
          maxItems: 3,
          maxPages: 5,
          includePatterns: include ? [include] : undefined,
          outputFormat: "html",
        });
        break;
      } catch (error) {
        const tooMany = error instanceof ZenRowsCrawlError && error.code === "too_many_crawls";
        if (!tooMany || Date.now() >= deadline) throw error;
        await sleep((error.retryAfter ?? 30) * 1000);
      }
    }
    console.log(`created ${created.crawl_id} (${created.status})`);
    ended = await client.wait(created.crawl_id);
    results = [];
    for await (const result of client.results(ended.crawl_id)) results.push(result);
    console.log(
      `ended ${ended.crawl_id}: ${ended.status}, ${results.length} results, coverage ${JSON.stringify(ended.coverage)}`,
    );
  }, 20 * 60_000);

  test("the crawl completes with at least one result, each matching the include pattern", () => {
    expect(ended.status).toBe("completed");
    expect(results.length).toBeGreaterThanOrEqual(1);
    if (include) for (const result of results) expect(result.url).toContain(include);
  });

  test("a fetched result's content is HTML", async () => {
    const fetched = results.find((r) => r.content_status === "fetched");
    expect(fetched).toBeDefined();
    const html = await client.content(ended.crawl_id, fetched as CrawlResult);
    expect(html.toLowerCase()).toMatch(/<html|<!doctype html/);
  }, 60_000);

  test("the download has the crawl's status and one line per result", async () => {
    const download = await client.download(ended.crawl_id);
    expect(download.status).toBe(ended.status);
    const lines = [];
    for await (const line of download.lines) lines.push(line);
    expect(lines.length).toBe(results.length);
  }, 60_000);

  test("the crawl is on the first page of the list", async () => {
    const page = await client.list({ limit: 100 });
    expect(page.crawls.map((c) => c.crawl_id)).toContain(ended.crawl_id);
  }, 60_000);

  test("stop on an ended crawl answers with its terminal status", async () => {
    const stopped = await client.stop(ended.crawl_id);
    expect(stopped.crawl_id).toBe(ended.crawl_id);
    expect(stopped.status).toBe(ended.status);
  }, 60_000);

  test("get on an unknown id throws crawl_not_found", async () => {
    await expect(client.get("c_does_not_exist")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ZenRowsCrawlError);
      const err = error as ZenRowsCrawlError;
      expect(err.status).toBe(404);
      expect(err.code).toBe("crawl_not_found");
      return true;
    });
  }, 60_000);
});
