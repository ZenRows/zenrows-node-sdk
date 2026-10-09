import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ZenRows } from "../src";
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

  test("list passes cursor and limit and returns one page", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/crawls`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({ crawls: [crawl({ crawl_id: "c_2" })], next_cursor: "p2" });
      }),
    );
    const page = await client.list({ cursor: "p1", limit: 5 });
    expect(query?.get("cursor")).toBe("p1");
    expect(query?.get("limit")).toBe("5");
    expect(page.crawls.map((c) => c.crawl_id)).toEqual(["c_2"]);
    expect(page.next_cursor).toBe("p2");
  });

  test("results follows next_cursor and stops on null", async () => {
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
    for await (const r of client.results("c_1")) urls.push(r.url);
    expect(urls).toEqual(["u1", "u2"]);
    expect(cursors).toEqual([null, "cur_1"]);
  });

  test("results on a running crawl returns once nothing more is kept yet", async () => {
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
    for await (const r of client.results("c_1")) urls.push(r.url);
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

  test("content takes a content id, a content_url or a result", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1/contents/ct_9`, () =>
        HttpResponse.text("<html>page</html>", { headers: { "Content-Type": "text/html" } }),
      ),
    );
    expect(await client.content("c_1", "ct_9")).toBe("<html>page</html>");
    expect(await client.content("c_1", "/v1/crawls/c_1/contents/ct_9")).toBe("<html>page</html>");
    expect(
      await client.content("c_1", {
        url: "https://example.com/product/a",
        content_status: "fetched",
        content_url: "/v1/crawls/c_1/contents/ct_9",
      }),
    ).toBe("<html>page</html>");
  });

  test("content rejects with a TypeError for a result without a usable content_url", async () => {
    await expect(
      client.content("c_1", { url: "https://example.com/a", content_status: "pending" }),
    ).rejects.toThrow(
      new TypeError(
        "content: result for https://example.com/a has no content_url (content_status: pending)",
      ),
    );
    await expect(
      client.content("c_1", {
        url: "https://example.com/a",
        content_url: "/v1/crawls/c_1/contents/",
      }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(client.content("c_1", "/v1/crawls/c_1/contents/")).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  test("download returns X-Crawl-Status and one parsed object per NDJSON line, across chunks", async () => {
    const lines = [
      { url: "u1", content_status: "fetched", content: "<html>1</html>" },
      { url: "u2", content_status: "fetched", content: { title: "A" } },
      { url: "u3", content_status: "failed" },
      { url: "u4" },
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
          headers: { "Content-Type": "application/x-ndjson", "X-Crawl-Status": "running" },
        });
      }),
    );
    const download = await client.download("c_1");
    expect(download.status).toBe("running");
    const got = [];
    for await (const line of download.lines) got.push(line);
    expect(got).toEqual(lines);
  });

  test("a request that outlasts the timeout fails", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json(crawl());
      }),
    );
    const quick = new ZenRowsCrawlClient("API_KEY", { timeout: 0.02, retries: 0 });
    await expect(quick.get("c_1")).rejects.toThrow(/timed out after 0.02s/);
  });

  test("the timeout does not cut a download body read after the headers", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1/download`, () => {
        const bytes = new TextEncoder().encode('{"url":"u1"}\n');
        const stream = new ReadableStream({
          async start(controller) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            controller.enqueue(bytes);
            controller.close();
          },
        });
        return new HttpResponse(stream, { headers: { "X-Crawl-Status": "completed" } });
      }),
    );
    const quick = new ZenRowsCrawlClient("API_KEY", { timeout: 0.02 });
    const download = await quick.download("c_1");
    const got = [];
    for await (const line of download.lines) got.push(line);
    expect(got).toEqual([{ url: "u1" }]);
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
        expect(err.detail).toBe("Invalid parameter.");
        return true;
      },
    );
  });

  test.each([undefined, "idem-1"])(
    "429 too_many_crawls is never retried on create (Idempotency-Key %s) and carries retryAfter",
    async (idempotencyKey) => {
      let calls = 0;
      server.use(
        http.post(`${BASE}/crawls`, () => {
          calls += 1;
          return problem(429, "too_many_crawls", "Too many crawls", { "Retry-After": "30" });
        }),
      );
      const retrying = new ZenRowsCrawlClient("API_KEY");
      await expect(
        retrying.create({ url: "https://example.com/", depth: 1 }, { idempotencyKey }),
      ).rejects.toSatisfy((error: unknown) => {
        const err = error as ZenRowsCrawlError;
        expect(err.status).toBe(429);
        expect(err.code).toBe("too_many_crawls");
        expect(err.retryAfter).toBe(30);
        return true;
      });
      expect(calls).toBe(1);
    },
  );

  test("a keyed create retries a 503", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/crawls`, () => {
        calls += 1;
        if (calls === 1)
          return problem(503, "internal_error", "Unavailable", { "Retry-After": "0" });
        return HttpResponse.json(crawl({ status: "running" }), { status: 202 });
      }),
    );
    const retrying = new ZenRowsCrawlClient("API_KEY");
    const created = await retrying.create(
      { url: "https://example.com/", depth: 1 },
      { idempotencyKey: "idem-1" },
    );
    expect(created.status).toBe("running");
    expect(calls).toBe(2);
  });

  test("code is undefined when the problem body has none", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1`, () =>
        HttpResponse.json({ title: "Bad Gateway", status: 502 }, { status: 502 }),
      ),
    );
    await expect(client.get("c_1")).rejects.toSatisfy((error: unknown) => {
      const err = error as ZenRowsCrawlError;
      expect(err.status).toBe(502);
      expect(err.code).toBeUndefined();
      return true;
    });
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
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
    const waiting = new ZenRowsCrawlClient("API_KEY").wait("c_1");
    await vi.advanceTimersByTimeAsync(10_000);
    const ended = await waiting;
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

  test("returns the running crawl once the timeout runs out", async () => {
    let polls = 0;
    server.use(
      http.get(`${BASE}/crawls/c_1`, () => {
        polls += 1;
        return HttpResponse.json(crawl({ status: "running", next_cursor: "c" }));
      }),
    );
    const waiting = new ZenRowsCrawlClient("API_KEY").wait("c_1", { timeout: 5 });
    await vi.advanceTimersByTimeAsync(10_000);
    const crawled = await waiting;
    expect(crawled.status).toBe("running");
    expect(crawled).not.toHaveProperty("results");
    expect(polls).toBeGreaterThan(1);
  });

  test("defaults to a 600 s timeout", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_1`, () =>
        HttpResponse.json(crawl({ status: "running", next_cursor: "c" })),
      ),
    );
    let settled = false;
    const waiting = new ZenRowsCrawlClient("API_KEY").wait("c_1").then((c) => {
      settled = true;
      return c;
    });
    await vi.advanceTimersByTimeAsync(590_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await waiting).status).toBe("running");
  });
});

describe("ZenRows.crawl", () => {
  test("is a ZenRowsCrawlClient on the instance's key", () => {
    const client = new ZenRows("API_KEY");
    expect(client.crawl).toBeInstanceOf(ZenRowsCrawlClient);
    expect(client.crawl.apiKey).toBe("API_KEY");
  });

  test("takes its config from the crawl option", async () => {
    server.use(http.get("https://example.com/v1/crawls/c_1", () => HttpResponse.json(crawl())));
    const client = new ZenRows("API_KEY", { crawl: { baseURL: "https://example.com/v1" } });
    expect((await client.crawl.get("c_1")).crawl_id).toBe("c_1");
  });
});
