import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import { ZenRows } from "../src";
import { WaiterTimeoutError } from "../src/batch/waiters";
import { ZenRowsCrawlClient } from "../src/crawl/client";
import { ZenRowsCrawlError } from "../src/crawl/errors";
import type { CrawlWithResults } from "../src/crawl/types";
import { server } from "./_setup";

const BASE = "https://api.zenrows.com/v1";

function crawl(overrides: Partial<CrawlWithResults> = {}): CrawlWithResults {
  return {
    crawl_id: "c_1",
    status: "completed",
    url: "https://example.com/",
    depth: 1,
    max_items: 10,
    max_pages: 10,
    coverage: { pages_fetched: 1, pages_failed: 0, items_found: 2 },
    created_at: "2026-10-08T09:00:00Z",
    results: [],
    next_cursor: null,
    ...overrides,
  };
}

function problem(status: number, code: string, title: string, headers?: Record<string, string>) {
  return HttpResponse.json(
    { code, title, detail: `${title}.`, status, instance: "urn:zenrows:request:x" },
    { status, headers: { "Content-Type": "application/problem+json", ...headers } },
  );
}

describe("ZenRowsCrawlClient — requests", () => {
  let client: ZenRowsCrawlClient;

  beforeEach(() => {
    client = new ZenRowsCrawlClient("API_KEY");
  });

  test("create sends snake_case fields, the API key and the Idempotency-Key", async () => {
    let seen: { headers: Headers; body: unknown } | undefined;
    server.use(
      http.post(`${BASE}/crawls`, async ({ request }) => {
        seen = { headers: request.headers, body: await request.json() };
        return HttpResponse.json(crawl({ status: "running" }), {
          status: 202,
          headers: { Location: "/v1/crawls/c_1" },
        });
      }),
    );
    const created = await client.create(
      {
        url: "https://example.com/",
        depth: 1,
        maxItems: 3,
        maxPages: 5,
        includePatterns: ["/product/"],
        excludePatterns: ["/cart"],
        outputFormat: "html",
      },
      { idempotencyKey: "idem-1" },
    );
    expect(created.crawl_id).toBe("c_1");
    expect(seen?.headers.get("X-API-Key")).toBe("API_KEY");
    expect(seen?.headers.get("Idempotency-Key")).toBe("idem-1");
    expect(seen?.body).toEqual({
      url: "https://example.com/",
      depth: 1,
      max_items: 3,
      max_pages: 5,
      include_patterns: ["/product/"],
      exclude_patterns: ["/cart"],
      output_format: "html",
    });
  });

  test("create sends only the fields the caller set", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/crawls`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(crawl({ status: "running" }), { status: 202 });
      }),
    );
    await client.create({ url: "https://example.com/", depth: 2 });
    expect(body).toEqual({ url: "https://example.com/", depth: 2 });
  });

  test("get passes cursor and limit, and parses results", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/crawls/c_1`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json(
          crawl({ results: [{ url: "https://example.com/product/a" }], next_cursor: "cur_1" }),
        );
      }),
    );
    const page = await client.get("c_1", { cursor: "cur_0", limit: 50 });
    expect(query?.get("cursor")).toBe("cur_0");
    expect(query?.get("limit")).toBe("50");
    expect(page.results).toEqual([{ url: "https://example.com/product/a" }]);
    expect(page.next_cursor).toBe("cur_1");
  });

  test("a baseURL override is used, with or without a trailing slash", async () => {
    server.use(http.get("https://example.com/v1/crawls/c_1", () => HttpResponse.json(crawl())));
    const local = new ZenRowsCrawlClient("API_KEY", { baseURL: "https://example.com/v1/" });
    expect((await local.get("c_1")).crawl_id).toBe("c_1");
  });

  test("tolerates unknown fields and enum values in responses", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1`, () =>
        HttpResponse.json({ ...crawl({ status: "archived" }), new_field: 1 }),
      ),
    );
    const got = await client.get("c_1");
    expect(got.status).toBe("archived");
  });

  test("list and iterCrawls follow next_cursor until it is absent", async () => {
    server.use(
      http.get(`${BASE}/crawls`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) {
          return HttpResponse.json({ crawls: [crawl({ crawl_id: "c_2" })], next_cursor: "p2" });
        }
        return HttpResponse.json({ crawls: [crawl({ crawl_id: "c_1" })] });
      }),
    );
    const ids: string[] = [];
    for await (const c of client.iterCrawls()) ids.push(c.crawl_id);
    expect(ids).toEqual(["c_2", "c_1"]);
  });

  test("iterResults follows next_cursor and stops on null", async () => {
    const cursors: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/crawls/c_1`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        cursors.push(cursor);
        if (!cursor) {
          return HttpResponse.json(crawl({ results: [{ url: "u1" }], next_cursor: "cur_1" }));
        }
        return HttpResponse.json(crawl({ results: [{ url: "u2" }], next_cursor: null }));
      }),
    );
    const urls: string[] = [];
    for await (const r of client.iterResults("c_1")) urls.push(r.url);
    expect(urls).toEqual(["u1", "u2"]);
    expect(cursors).toEqual([null, "cur_1"]);
  });

  test("iterResults on a running crawl returns once nothing more is kept yet", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/crawls/c_1`, ({ request }) => {
        calls += 1;
        const cursor = new URL(request.url).searchParams.get("cursor");
        const results = cursor ? [] : [{ url: "u1" }];
        return HttpResponse.json(crawl({ status: "running", results, next_cursor: "cur_1" }));
      }),
    );
    const urls: string[] = [];
    for await (const r of client.iterResults("c_1")) urls.push(r.url);
    expect(urls).toEqual(["u1"]);
    expect(calls).toBe(2);
  });

  test("stop posts with no body and returns the stop answer", async () => {
    let hadBody = true;
    server.use(
      http.post(`${BASE}/crawls/c_1/stop`, async ({ request }) => {
        hadBody = (await request.text()).length > 0;
        return HttpResponse.json({ crawl_id: "c_1", status: "stopped", stop_reason: "user" });
      }),
    );
    const stopped = await client.stop("c_1");
    expect(hadBody).toBe(false);
    expect(stopped).toEqual({ crawl_id: "c_1", status: "stopped", stop_reason: "user" });
  });

  test("getContent takes a content id or a result's content_url", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1/contents/ct_9`, () =>
        HttpResponse.text("<html>page</html>", { headers: { "Content-Type": "text/html" } }),
      ),
    );
    expect(await client.getContent("c_1", "ct_9")).toBe("<html>page</html>");
    expect(
      await client.getContent("c_1", {
        url: "https://example.com/product/a",
        content_status: "fetched",
        content_url: "/v1/crawls/c_1/contents/ct_9",
      }),
    ).toBe("<html>page</html>");
  });

  test("getContent refuses a result whose page was not fetched", async () => {
    await expect(
      client.getContent("c_1", { url: "https://example.com/a", content_status: "pending" }),
    ).rejects.toThrow(/no content_url/);
  });

  test("download yields one parsed object per NDJSON line, across chunk boundaries", async () => {
    const lines = [
      { url: "u1", content_status: "fetched", content: "<html>1</html>" },
      { url: "u2", content_status: "failed" },
      { url: "u3" },
    ];
    const text = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
    server.use(
      http.get(`${BASE}/crawls/c_1/download`, () => {
        const bytes = new TextEncoder().encode(text);
        const stream = new ReadableStream({
          start(controller) {
            for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
            controller.close();
          },
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "application/x-ndjson", "X-Crawl-Status": "completed" },
        });
      }),
    );
    const got = [];
    for await (const line of client.download("c_1")) got.push(line);
    expect(got).toEqual(lines);
  });
});

describe("ZenRowsCrawlClient — errors", () => {
  let client: ZenRowsCrawlClient;

  beforeEach(() => {
    client = new ZenRowsCrawlClient("API_KEY", { retries: 0 });
  });

  test("404 crawl_not_found", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_missing`, () =>
        problem(404, "crawl_not_found", "Crawl not found"),
      ),
    );
    await expect(client.get("c_missing")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ZenRowsCrawlError);
      const err = error as ZenRowsCrawlError;
      expect(err.status).toBe(404);
      expect(err.code).toBe("crawl_not_found");
      return true;
    });
  });

  test("422 invalid_parameter carries the problem detail", async () => {
    server.use(
      http.post(`${BASE}/crawls`, () => problem(422, "invalid_parameter", "Invalid parameter")),
    );
    await expect(client.create({ url: "https://example.com/", depth: 0 })).rejects.toSatisfy(
      (error: unknown) => {
        const err = error as ZenRowsCrawlError;
        expect(err.status).toBe(422);
        expect(err.code).toBe("invalid_parameter");
        expect(err.problem?.detail).toBe("Invalid parameter.");
        return true;
      },
    );
  });

  test("429 too_many_crawls is not retried without an Idempotency-Key and carries retryAfter", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/crawls`, () => {
        calls += 1;
        return problem(429, "too_many_crawls", "Too many crawls", { "Retry-After": "30" });
      }),
    );
    const retrying = new ZenRowsCrawlClient("API_KEY");
    await expect(retrying.create({ url: "https://example.com/", depth: 1 })).rejects.toSatisfy(
      (error: unknown) => {
        const err = error as ZenRowsCrawlError;
        expect(err.status).toBe(429);
        expect(err.code).toBe("too_many_crawls");
        expect(err.retryAfter).toBe(30);
        return true;
      },
    );
    expect(calls).toBe(1);
  });

  test("403 REQS008 says Crawl is not enabled for this account", async () => {
    server.use(
      http.get(`${BASE}/crawls`, () =>
        HttpResponse.json(
          {
            code: "REQS008",
            title: "Crawl is not enabled for this account.",
            detail: "Crawl is not enabled for this account.",
            status: 403,
            type: "https://docs.zenrows.com/api-error-codes#REQS008",
            instance: "/v1/crawls",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await expect(client.list()).rejects.toSatisfy((error: unknown) => {
      const err = error as ZenRowsCrawlError;
      expect(err).toBeInstanceOf(ZenRowsCrawlError);
      expect(err.status).toBe(403);
      expect(err.code).toBe("REQS008");
      expect(err.message).toMatch(/^403 Crawl is not enabled for this account \(REQS008\)/);
      return true;
    });
  });
});

describe("ZenRowsCrawlClient — wait", () => {
  test("polls with limit=1 until the crawl ends, and returns it without results", async () => {
    let polls = 0;
    const limits: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/crawls/c_1`, ({ request }) => {
        polls += 1;
        limits.push(new URL(request.url).searchParams.get("limit"));
        const status = polls < 3 ? "running" : "completed";
        return HttpResponse.json(
          crawl({
            status,
            results: [{ url: "u1" }],
            next_cursor: status === "running" ? "c" : null,
          }),
        );
      }),
    );
    const client = new ZenRowsCrawlClient("API_KEY");
    const ended = await client.wait("c_1", { pollInterval: 0.01, maxPollInterval: 0.01 });
    expect(ended.status).toBe("completed");
    expect(ended).not.toHaveProperty("results");
    expect(ended).not.toHaveProperty("next_cursor");
    expect(polls).toBe(3);
    expect(limits.every((l) => l === "1")).toBe(true);
  });

  test("resolves on a failed crawl, with its error", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1`, () =>
        HttpResponse.json(
          crawl({ status: "failed", error: { code: "seed_unreachable", detail: "x" } }),
        ),
      ),
    );
    const ended = await new ZenRowsCrawlClient("API_KEY").wait("c_1");
    expect(ended.error?.code).toBe("seed_unreachable");
  });

  test("throws WaiterTimeoutError when the crawl keeps running", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1`, () =>
        HttpResponse.json(crawl({ status: "running", next_cursor: "c" })),
      ),
    );
    await expect(
      new ZenRowsCrawlClient("API_KEY").wait("c_1", {
        timeout: 0.05,
        pollInterval: 0.01,
        maxPollInterval: 0.01,
      }),
    ).rejects.toBeInstanceOf(WaiterTimeoutError);
  });
});

describe("ZenRows.crawl", () => {
  test("is a ZenRowsCrawlClient on the instance's key", () => {
    const client = new ZenRows("API_KEY");
    expect(client.crawl).toBeInstanceOf(ZenRowsCrawlClient);
    expect(client.crawl.apiKey).toBe("API_KEY");
  });
});
