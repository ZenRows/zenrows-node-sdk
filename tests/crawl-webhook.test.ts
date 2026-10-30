import { createHmac } from "node:crypto";
import { http, HttpResponse } from "msw";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  type CrawlWebhookEvent,
  type CrawlWebhookParams,
  ZenRowsCrawlClient,
  verifyCrawlWebhookSignature,
} from "../src";
import type { CrawlWithResults } from "../src/crawl/types";
import { server } from "./_setup";

const BASE = "https://api.zenrows.com/v1";

function crawl(overrides: Partial<CrawlWithResults> = {}): CrawlWithResults {
  return {
    crawl_id: "c_01M5AKXYZ",
    status: "running",
    url: "https://example.com/",
    max_items: 100,
    max_pages: 100,
    coverage: { pages_fetched: 0, pages_failed: 0, items_found: 0 },
    created_at: "2026-10-27T10:40:00Z",
    results: [],
    next_cursor: "n",
    ...overrides,
  };
}

describe("ZenRowsCrawlClient — webhook", () => {
  test("create sends the webhook as given and returns the crawl's webhook", async () => {
    let body: unknown;
    const webhook = {
      url: "https://hooks.example.com/zenrows",
      events: ["crawl.completed", "crawl.failed"],
      metadata: { site: "books", n: 1 },
    } satisfies CrawlWebhookParams;
    server.use(
      http.post(`${BASE}/crawls`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(crawl({ webhook }), { status: 202 });
      }),
    );
    const created = await new ZenRowsCrawlClient("API_KEY").create({
      url: "https://example.com/",
      webhook,
    });
    expect(body).toEqual({ url: "https://example.com/", webhook });
    expect(created.webhook).toEqual(webhook);
  });

  test("a webhook with only a url sends only the url, and reads back all four events", async () => {
    let body: unknown;
    const all = ["crawl.started", "crawl.completed", "crawl.stopped", "crawl.failed"];
    server.use(
      http.post(`${BASE}/crawls`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          crawl({ webhook: { url: "https://hooks.example.com/z", events: all, metadata: null } }),
          { status: 202 },
        );
      }),
    );
    const created = await new ZenRowsCrawlClient("API_KEY").create({
      url: "https://example.com/",
      webhook: { url: "https://hooks.example.com/z" },
    });
    expect(body).toEqual({
      url: "https://example.com/",
      webhook: { url: "https://hooks.example.com/z" },
    });
    expect(created.webhook?.events).toEqual(all);
    expect(created.webhook?.metadata).toBeNull();
  });

  test("a crawl without a webhook parses, on get and on list", async () => {
    server.use(
      http.get(`${BASE}/crawls/c_01M5AKXYZ`, () => HttpResponse.json(crawl())),
      http.get(`${BASE}/crawls`, () => HttpResponse.json({ crawls: [crawl()] })),
    );
    const client = new ZenRowsCrawlClient("API_KEY");
    expect((await client.get("c_01M5AKXYZ")).webhook).toBeUndefined();
    expect((await client.list()).crawls[0]?.webhook).toBeUndefined();
  });

  test("a 422 webhook_signing_key_required surfaces as ZenRowsCrawlError with its code", async () => {
    server.use(
      http.post(`${BASE}/crawls`, () =>
        HttpResponse.json(
          {
            code: "webhook_signing_key_required",
            title: "Unprocessable Content",
            detail: "Create a webhook signing key in the dashboard, then retry.",
            status: 422,
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await expect(
      new ZenRowsCrawlClient("API_KEY", { retries: 0 }).create({
        url: "https://example.com/",
        webhook: { url: "https://hooks.example.com/z" },
      }),
    ).rejects.toMatchObject({
      name: "ZenRowsCrawlError",
      status: 422,
      code: "webhook_signing_key_required",
    });
  });

  test("the event type matches the contract's example", () => {
    const event: CrawlWebhookEvent = {
      schema: "zenrows.webhook/v1",
      event_id: "ev_01M5AKXYZ_completed",
      event_type: "crawl.completed",
      occurred_at: "2026-10-27T10:42:10Z",
      resource: { type: "crawl", id: "c_01M5AKXYZ", url: `${BASE}/crawls/c_01M5AKXYZ` },
      metadata: { site: "golfclub" },
    };
    expect(event.resource.id).toBe("c_01M5AKXYZ");
    expectTypeOf<CrawlWebhookParams["events"]>().toEqualTypeOf<
      ("crawl.started" | "crawl.completed" | "crawl.stopped" | "crawl.failed")[] | undefined
    >();
  });
});

describe("verifyCrawlWebhookSignature", () => {
  const raw = Buffer.alloc(32, 9);
  const secrets = { k1: raw.toString("base64") };
  const T = 1793097730;
  const BODY =
    '{"schema":"zenrows.webhook/v1","event_id":"ev_01M5AKXYZ_completed","event_type":"crawl.completed","occurred_at":"2026-10-27T10:42:10Z","resource":{"type":"crawl","id":"c_01M5AKXYZ","url":"https://api.zenrows.com/v1/crawls/c_01M5AKXYZ"},"metadata":{"site":"golfclub"}}';
  const sig = createHmac("sha256", raw).update(`${T}.${BODY}`).digest("hex");

  test("accepts a genuine crawl event and rejects a tampered one", () => {
    const header = `t=${T},v1=${sig},kid=k1`;
    expect(verifyCrawlWebhookSignature(BODY, header, secrets, { now: T })).toBe(true);
    expect(verifyCrawlWebhookSignature(Buffer.from(BODY), header, secrets, { now: T })).toBe(true);
    expect(
      verifyCrawlWebhookSignature(BODY.replace("golfclub", "golfclub2"), header, secrets, {
        now: T,
      }),
    ).toBe(false);
  });

  test("rejects an unknown kid, a stale timestamp and a missing header", () => {
    expect(verifyCrawlWebhookSignature(BODY, `t=${T},v1=${sig},kid=k9`, secrets, { now: T })).toBe(
      false,
    );
    expect(
      verifyCrawlWebhookSignature(BODY, `t=${T},v1=${sig},kid=k1`, secrets, { now: T + 301 }),
    ).toBe(false);
    expect(verifyCrawlWebhookSignature(BODY, undefined, secrets, { now: T })).toBe(false);
  });
});
