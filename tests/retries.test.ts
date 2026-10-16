import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ZenRows } from "../src";
import { retryPolicy } from "../src/retry";
import { server } from "./_setup";

const apiUrl = "https://api.zenrows.com/v1/";
const url = "https://example.com";

/** A policy on a fake clock, so budget checks can be driven by hand. */
function policyAt(
  clock: { ms: number },
  overrides: Partial<Parameters<typeof retryPolicy>[0]> = {},
) {
  return retryPolicy({
    retries: 10,
    retryMaxWait: 30,
    retryBudget: 90,
    now: () => clock.ms,
    random: () => 0.5,
    ...overrides,
  });
}

const status = (code: number, headers: Record<string, string> = {}) =>
  new Response(null, { status: code, headers });

describe("retryPolicy", () => {
  test("retries 429, 502, 503 and 504", () => {
    for (const code of [429, 502, 503, 504]) {
      expect(policyAt({ ms: 0 }).retryOn(0, null, status(code))).toBe(true);
    }
  });

  test("never retries other statuses, 422 included", () => {
    for (const code of [200, 400, 401, 402, 403, 404, 409, 422, 500]) {
      expect(policyAt({ ms: 0 }).retryOn(0, null, status(code))).toBe(false);
    }
  });

  test("retries a network error, never an abort or a timeout", () => {
    expect(policyAt({ ms: 0 }).retryOn(0, new TypeError("fetch failed"), null)).toBe(true);
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    expect(policyAt({ ms: 0 }).retryOn(0, abort, null)).toBe(false);
    expect(policyAt({ ms: 0 }).retryOn(0, timeout, null)).toBe(false);
  });

  test("stops after `retries` retries", () => {
    const policy = policyAt({ ms: 0 }, { retries: 2 });
    expect(policy.retryOn(0, null, status(503))).toBe(true);
    expect(policy.retryOn(1, null, status(503))).toBe(true);
    expect(policy.retryOn(2, null, status(503))).toBe(false);
  });

  test("full jitter stays within [0.25 s, min(retryMaxWait, 1 s * 2^attempt)]", () => {
    const ceilings = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    ceilings.forEach((ceiling, attempt) => {
      const low = policyAt({ ms: 0 }, { random: () => 0 });
      const high = policyAt({ ms: 0 }, { random: () => 0.999999 });
      low.retryOn(attempt, null, status(503));
      high.retryOn(attempt, null, status(503));
      expect(low.retryDelay()).toBe(250);
      expect(high.retryDelay()).toBeGreaterThan(ceiling - 1);
      expect(high.retryDelay()).toBeLessThanOrEqual(ceiling);
    });
  });

  test("retryMaxWait caps the jitter ceiling", () => {
    const policy = policyAt({ ms: 0 }, { retryMaxWait: 2, random: () => 0.999999 });
    policy.retryOn(5, null, status(503));
    expect(policy.retryDelay()).toBeLessThanOrEqual(2000);
  });

  test("honours a Retry-After in seconds, capped at 30 s", () => {
    const short = policyAt({ ms: 0 });
    short.retryOn(0, null, status(503, { "Retry-After": "7" }));
    expect(short.retryDelay()).toBe(7000);

    const long = policyAt({ ms: 0 });
    long.retryOn(0, null, status(429, { "Retry-After": "3600" }));
    expect(long.retryDelay()).toBe(30_000);
  });

  test.each(["Wed, 21 Oct 2015 07:28:00 GMT", "1.5", "-3", "soon"])(
    "falls back to jitter when Retry-After is %s",
    (value) => {
      const policy = policyAt({ ms: 0 }, { random: () => 0 });
      policy.retryOn(0, null, status(503, { "Retry-After": value }));
      expect(policy.retryDelay()).toBe(250);
    },
  );

  test("starts no retry that would pass the budget", () => {
    const clock = { ms: 0 };
    const policy = policyAt(clock, { retryBudget: 10 });
    clock.ms = 3000;
    expect(policy.retryOn(0, null, status(503, { "Retry-After": "7" }))).toBe(true);
    clock.ms = 3001;
    expect(policy.retryOn(1, null, status(503, { "Retry-After": "7" }))).toBe(false);
  });
});

describe("ZenRows client retries", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("a 503 is retried after a jittered wait, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return calls === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ ok: 1 });
      }),
    );

    const pending = new ZenRows("API_KEY").fetch(url);
    await vi.advanceTimersByTimeAsync(249);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("a network error is retried", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json({ ok: 1 });
      }),
    );

    const pending = new ZenRows("API_KEY").fetch(url);
    await vi.advanceTimersByTimeAsync(250);

    expect((await pending).status).toBe(200);
    expect(calls).toBe(2);
  });

  test("waits the Retry-After the server sends", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return calls === 1
          ? new HttpResponse(null, { status: 429, headers: { "Retry-After": "5" } })
          : HttpResponse.json({ ok: 1 });
      }),
    );

    const pending = new ZenRows("API_KEY").fetch(url);
    await vi.advanceTimersByTimeAsync(4999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect((await pending).status).toBe(200);
    expect(calls).toBe(2);
  });

  test("returns the last answer once the budget would be passed", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503, headers: { "Retry-After": "20" } });
      }),
    );

    const pending = new ZenRows("API_KEY", { retries: 5, retryBudget: 45 }).fetch(url);
    await vi.advanceTimersByTimeAsync(60_000);
    const response = await pending;

    // Waits 20 s, then 20 s more (40 s spent); a third wait would end at 60 s, past 45 s.
    expect(response.status).toBe(503);
    expect(calls).toBe(3);
  });

  test.each([400, 422])("a %i is not retried", async (code) => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return HttpResponse.json({ code: "RESP001" }, { status: code });
      }),
    );

    const response = await new ZenRows("API_KEY", { retries: 3 }).fetch(url);

    expect(response.status).toBe(code);
    expect(calls).toBe(1);
  });

  test("an abort is not retried", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(new ZenRows("API_KEY", { retries: 3 }).fetch(url)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("the extract() autoparse fallback is unchanged: one fallback request, no retries", async () => {
    const urls: URL[] = [];
    server.use(
      http.get(apiUrl, ({ request }) => {
        urls.push(new URL(request.url));
        return urls.length === 1
          ? HttpResponse.json({ code: "REQS007" }, { status: 403 })
          : HttpResponse.json([{ found: "via autoparse" }]);
      }),
    );

    const response = await new ZenRows("API_KEY").extract(url);

    expect(response.status).toBe(200);
    expect(urls).toHaveLength(2);
    expect(urls[1]?.searchParams.get("autoparse")).toBe("true");
  });
});
