import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ZenRows, ZenRowsPreparedDomainError } from "../src";
import { retryPolicy, retryWaitMs } from "../src/retry";
import { server } from "./_setup";

const apiUrl = "https://api.zenrows.com/v1/";
const url = "https://example.com";

const status = (code: number, headers: Record<string, string> = {}) =>
  new Response(null, { status: code, headers });
/** The error Node's fetch throws: `TypeError("fetch failed")`, caused by a system error with
 * the `code` and `syscall` a socket sets. */
const failed = (code: string, syscall?: string) =>
  new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code, syscall }) });
const refused = failed("ECONNREFUSED", "connect");
/** Node's happy-eyeballs error: one inner error per address, and the first one's `code` on top. */
const everyAddress = (...errors: TypeError[]) =>
  new TypeError("fetch failed", {
    cause: Object.assign(new AggregateError(errors.map((each) => each.cause)), {
      code: "ECONNREFUSED",
    }),
  });

/** The first retry decision for one answer or error. */
const retried = (
  error: Error | null,
  response: Response | null,
  params: Record<string, unknown> = {},
) =>
  retryPolicy({ retries: 3, retryMaxWait: 30, retryBudget: 90 }, params).retryOn(
    0,
    error,
    response,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("conformance vectors", () => {
  test.each([
    { retryAfter: "5", maxWaitMs: 30_000, waitMs: 5000 },
    { retryAfter: " 7 ", maxWaitMs: 30_000, waitMs: 7000 },
    { retryAfter: "0", maxWaitMs: 30_000, waitMs: 250 },
    { retryAfter: "99999", maxWaitMs: 30_000, waitMs: 30_000 },
    { retryAfter: "20", maxWaitMs: 5000, waitMs: 20_000 },
    // Anything but whole seconds is ignored, and the wait is jitter (250 ms with random() = 0).
    ...["1.5", "-1", "1e3", "", "abc", "Wed, 21 Oct 2026 07:28:00 GMT"].map((retryAfter) => ({
      retryAfter,
      maxWaitMs: 30_000,
      waitMs: 250,
    })),
  ])("Retry-After $retryAfter with retryMaxWait $maxWaitMs ms waits $waitMs ms", (vector) => {
    const response = status(503, { "Retry-After": vector.retryAfter });
    expect(retryWaitMs(0, response, vector.maxWaitMs)).toBe(vector.waitMs);
  });

  test.each([
    { attempt: 0, maxWaitMs: 30_000, highMs: 1000 },
    { attempt: 1, maxWaitMs: 30_000, highMs: 2000 },
    { attempt: 2, maxWaitMs: 30_000, highMs: 4000 },
    { attempt: 5, maxWaitMs: 30_000, highMs: 30_000 },
    { attempt: 4, maxWaitMs: 5000, highMs: 5000 },
    { attempt: 3, maxWaitMs: 100, highMs: 250 },
  ])("jitter for attempt $attempt, retryMaxWait $maxWaitMs ms: 250 to $highMs ms", (vector) => {
    expect(retryWaitMs(vector.attempt, null, vector.maxWaitMs)).toBe(250);
    vi.spyOn(Math, "random").mockReturnValue(1 - Number.EPSILON);
    expect(retryWaitMs(vector.attempt, null, vector.maxWaitMs)).toBeCloseTo(vector.highMs, 6);
  });

  test.each<{ name: string; code: number; body?: object; retry: boolean }>([
    ...[429, 502, 503, 504].map((code) => ({ name: String(code), code, retry: true })),
    { name: "422 RESP001", code: 422, body: { code: "RESP001" }, retry: true },
    { name: "422 with no body", code: 422, retry: true },
    { name: "422 no_data_extracted", code: 422, body: { code: "no_data_extracted" }, retry: false },
    ...[200, 400, 401, 402, 403, 404, 409, 500].map((code) => ({
      name: String(code),
      code,
      retry: false,
    })),
  ])("a $name answer: retried $retry", async ({ code, body, retry }) => {
    const response = body ? Response.json(body, { status: code }) : status(code);
    expect(await retried(null, response)).toBe(retry);
  });

  test.each([
    ...["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].map(
      (code) => [code, failed(code, "connect"), true] as const,
    ),
    ["a connect timeout", failed("UND_ERR_CONNECT_TIMEOUT"), true],
    ["ETIMEDOUT from connect", failed("ETIMEDOUT", "connect"), true],
    [
      "every address failed to connect",
      everyAddress(refused, failed("ETIMEDOUT", "connect")),
      true,
    ],
    ["ETIMEDOUT from read", failed("ETIMEDOUT", "read"), false],
    ["ETIMEDOUT with no syscall", failed("ETIMEDOUT"), false],
    ["one address with a read timeout", everyAddress(refused, failed("ETIMEDOUT", "read")), false],
    ["an AggregateError with no inner error", everyAddress(), false],
    ["a socket closed after sending", failed("UND_ERR_SOCKET"), false],
    ["a reset", failed("ECONNRESET", "read"), false],
    ["a headers timeout", failed("UND_ERR_HEADERS_TIMEOUT"), false],
    ["a body timeout", failed("UND_ERR_BODY_TIMEOUT"), false],
    ["an abort", new DOMException("aborted", "AbortError"), false],
    ["a timeout signal", new DOMException("timed out", "TimeoutError"), false],
    ["an invalid header value", new TypeError("invalid header value"), false],
  ] as const)("%s: retried %s", async (_name, error, retry) => {
    expect(await retried(error, null)).toBe(retry);
  });
});

describe("a status from the target site is never retried", () => {
  test.each([true, "true", " TRUE ", 1, "1"])("original_status %j", async (on) => {
    for (const code of [429, 502, 503, 504, 422]) {
      expect(await retried(null, status(code), { original_status: on })).toBe(false);
    }
  });

  test.each([false, "false", 0, "0", ""])(
    "original_status %j keeps the usual retries",
    async (off) => {
      expect(await retried(null, status(503), { original_status: off })).toBe(true);
    },
  );

  test.each(["503", "404, 503", ["404", "503"], [404, 503], 503])(
    "allowed_status_codes %j: a 503 is final, a 502 is retried",
    async (listed) => {
      expect(await retried(null, status(503), { allowed_status_codes: listed })).toBe(false);
      expect(await retried(null, status(502), { allowed_status_codes: listed })).toBe(true);
    },
  );

  test("a refused connection is still retried", async () => {
    expect(await retried(refused, null, { original_status: true })).toBe(true);
    expect(await retried(refused, null, { allowed_status_codes: "503" })).toBe(true);
  });
});

describe("retry policy", () => {
  test("starts no retry once the time since the first try plus the next wait passes the budget", async () => {
    const policy = retryPolicy({ retries: 5, retryMaxWait: 30, retryBudget: 10 });
    vi.advanceTimersByTime(3000);
    expect(await policy.retryOn(0, null, status(503, { "Retry-After": "7" }))).toBe(true);
    expect(policy.retryDelay()).toBe(7000);
    vi.advanceTimersByTime(1);
    expect(await policy.retryOn(1, null, status(503, { "Retry-After": "7" }))).toBe(false);
  });

  test("cancels the body of the answer it drops, and leaves the final one unread", async () => {
    const cancelled: string[] = [];
    const answer = (name: string) =>
      new Response(new ReadableStream({ cancel: () => void cancelled.push(name) }), {
        status: 503,
      });
    const policy = retryPolicy({ retries: 1, retryMaxWait: 30, retryBudget: 90 });

    await policy.retryOn(0, null, answer("retried"));
    await policy.retryOn(1, null, answer("final"));
    await Promise.resolve();

    expect(cancelled).toEqual(["retried"]);
  });
});

describe("the client", () => {
  /** Answers the API calls with `answers` in order, repeating the last one, and counts them. */
  function answerWith(...answers: (() => Response)[]) {
    const calls = { count: 0 };
    const handle = () => (answers[Math.min(calls.count++, answers.length - 1)] as () => Response)();
    server.use(http.get(apiUrl, handle), http.post(apiUrl, handle));
    return calls;
  }

  async function settle<T>(pending: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(120_000);
    return pending;
  }

  test("sends a request once by default, and returns the 503", async () => {
    const calls = answerWith(() => status(503));
    expect((await settle(new ZenRows("API_KEY").fetch(url))).status).toBe(503);
    expect(calls.count).toBe(1);
  });

  test("retries a 503 after the jitter wait, then returns the success", async () => {
    const calls = answerWith(
      () => status(503),
      () => status(200),
    );

    const pending = new ZenRows("API_KEY", { retries: 2 }).fetch(url);
    await vi.advanceTimersByTimeAsync(249);
    expect(calls.count).toBe(1);

    expect((await settle(pending)).status).toBe(200);
    expect(calls.count).toBe(2);
  });

  test("waits the Retry-After the API sends", async () => {
    const calls = answerWith(
      () => status(429, { "Retry-After": "5" }),
      () => status(200),
    );

    const pending = new ZenRows("API_KEY", { retries: 2 }).fetch(url);
    await vi.advanceTimersByTimeAsync(4999);
    expect(calls.count).toBe(1);

    expect((await settle(pending)).status).toBe(200);
    expect(calls.count).toBe(2);
  });

  test("returns the last answer once the next wait would pass retryBudget", async () => {
    const calls = answerWith(() => status(503, { "Retry-After": "20" }));
    // 20 s, then 40 s: a third wait would end at 60 s, past 45 s.
    const client = new ZenRows("API_KEY", { retries: 5, retryBudget: 45 });
    expect((await settle(client.fetch(url))).status).toBe(503);
    expect(calls.count).toBe(3);
  });

  test.each([
    { name: "post()", call: (c: ZenRows) => c.post(url, {}, { data: { a: 1 } }) },
    {
      name: "post() with an Idempotency-Key",
      call: (c: ZenRows) =>
        c.post(url, {}, { headers: { "Idempotency-Key": "k" }, data: { a: 1 } }),
    },
    {
      name: "fetch() with original_status",
      call: (c: ZenRows) => c.fetch(url, { original_status: true }),
    },
    {
      name: "extract() with original_status",
      call: (c: ZenRows) => c.extract(url, { original_status: true }),
    },
    {
      name: "fetch() with allowed_status_codes 503",
      call: (c: ZenRows) => c.fetch(url, { allowed_status_codes: "503" }),
    },
  ])("sends $name once on a 503, with retries: 3", async ({ call }) => {
    const calls = answerWith(() => status(503));
    expect((await settle(call(new ZenRows("API_KEY", { retries: 3 })))).status).toBe(503);
    expect(calls.count).toBe(1);
  });

  test.each([
    ["prepareDomain", (c: ZenRows) => c.prepareDomain("www.example.com", [url])],
    ["preparedDomainStatus", (c: ZenRows) => c.preparedDomainStatus("www.example.com")],
  ] as const)("%s() rejects on the first 503, with retries: 5", async (_name, call) => {
    let calls = 0;
    const answer = () => {
      calls += 1;
      return HttpResponse.json({ code: "overloaded" }, { status: 503 });
    };
    const preparedDomains = `${apiUrl}extract/prepared-domains`;
    server.use(http.post(preparedDomains, answer), http.get(`${preparedDomains}/:domain`, answer));

    const error = await settle(call(new ZenRows("API_KEY", { retries: 5 })).catch((e) => e));
    expect(error).toBeInstanceOf(ZenRowsPreparedDomainError);
    expect(calls).toBe(1);
  });

  test.each(["retryMaxWait", "retryBudget"] as const)("rejects an invalid %s", (name) => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "5", null]) {
      expect(() => new ZenRows("API_KEY", { [name]: value as number })).toThrow(RangeError);
    }
    expect(() => new ZenRows("API_KEY", { [name]: 0.5 })).not.toThrow();
  });
});
