import { Readable } from "node:stream";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ZenRows, ZenRowsPreparedDomainError } from "../src";
import { backoffMs, isRetryEligible, retryAfterMs, retryPolicy } from "../src/retry";
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

/** The error undici throws: `TypeError('fetch failed')` with the cause carrying the code. */
const fetchFailed = (code: string) =>
  new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });

/** A Node system error, as a socket raises it: a `code` and the `syscall` that failed. */
const systemError = (code: string, syscall?: string) =>
  Object.assign(new Error(`${syscall ?? "?"} ${code}`), { code, syscall });

/**
 * `fetch failed` caused by an `AggregateError`, as Node throws it when every address it tried
 * failed. Two shapes: Node copies the first inner error's `code` onto the aggregate, and a
 * runtime that does not leaves it off. The policy must judge both by the inner errors alone.
 */
const aggregateFailed = (errors: Error[]) => {
  const withCode = Object.assign(new AggregateError(errors), {
    code: (errors[0] as { code?: string } | undefined)?.code,
  });
  return [
    new TypeError("fetch failed", { cause: withCode }),
    new TypeError("fetch failed", { cause: new AggregateError(errors) }),
  ];
};

/** The highest value `Math.random()` can return. */
const RANDOM_MAX = 1 - Number.EPSILON;

describe("conformance vectors", () => {
  test.each([
    ["5", 5000],
    ["0", 250],
    [" 7 ", 7000],
    ["99999", 30_000],
  ])("Retry-After %j waits %i ms", (value, expected) => {
    expect(retryAfterMs(status(503, { "Retry-After": value }))).toBe(expected);
    const policy = policyAt({ ms: 0 });
    return policy.retryOn(0, null, status(503, { "Retry-After": value })).then((retried) => {
      expect(retried).toBe(true);
      expect(policy.retryDelay()).toBe(expected);
    });
  });

  test.each(["1.5", "-1", "1e3", "0x10", "", "abc", "Wed, 21 Oct 2026 07:28:00 GMT"])(
    "Retry-After %j is ignored and the wait is jitter",
    async (value) => {
      expect(retryAfterMs(status(503, { "Retry-After": value }))).toBeUndefined();
      const policy = policyAt({ ms: 0 }, { random: () => 0 });
      await policy.retryOn(0, null, status(503, { "Retry-After": value }));
      expect(policy.retryDelay()).toBe(250);
    },
  );

  test.each([
    { attempt: 0, maxWaitMs: 30_000, high: 1000 },
    { attempt: 1, maxWaitMs: 30_000, high: 2000 },
    { attempt: 2, maxWaitMs: 30_000, high: 4000 },
    { attempt: 5, maxWaitMs: 30_000, high: 30_000 },
    { attempt: 9, maxWaitMs: 30_000, high: 30_000 },
    { attempt: 4, maxWaitMs: 5000, high: 5000 },
    { attempt: 3, maxWaitMs: 100, high: 250 },
  ])(
    "jitter for attempt $attempt with retryMaxWait $maxWaitMs ms is [250, $high] ms",
    ({ attempt, maxWaitMs, high }) => {
      expect(backoffMs(attempt, maxWaitMs, () => 0)).toBe(250);
      expect(backoffMs(attempt, maxWaitMs, () => RANDOM_MAX)).toBeCloseTo(high, 6);
    },
  );

  test.each([429, 502, 503, 504])("a %i is retried", async (code) => {
    expect(await policyAt({ ms: 0 }).retryOn(0, null, status(code))).toBe(true);
  });

  test.each([200, 400, 401, 402, 403, 404, 409, 500])("a %i is not retried", async (code) => {
    expect(await policyAt({ ms: 0 }).retryOn(0, null, status(code))).toBe(false);
  });

  test("a 422 is retried unless its code is no_data_extracted", async () => {
    const noData = Response.json({ code: "no_data_extracted" }, { status: 422 });
    expect(await policyAt({ ms: 0 }).retryOn(0, null, noData)).toBe(false);
    expect(await noData.json()).toEqual({ code: "no_data_extracted" });

    const other = Response.json({ code: "RESP001" }, { status: 422 });
    expect(await policyAt({ ms: 0 }).retryOn(0, null, other)).toBe(true);
    const noBody = status(422);
    expect(await policyAt({ ms: 0 }).retryOn(0, null, noBody)).toBe(true);
  });

  test.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"])(
    "a failure before the request was sent (%s) is retried",
    async (code) => {
      expect(await policyAt({ ms: 0 }).retryOn(0, fetchFailed(code), null)).toBe(true);
    },
  );

  test("a connect timeout is retried", async () => {
    const error = fetchFailed("UND_ERR_CONNECT_TIMEOUT");
    expect(await policyAt({ ms: 0 }).retryOn(0, error, null)).toBe(true);
  });

  test("a plain connect timeout (ETIMEDOUT from connect) is retried", async () => {
    const error = new TypeError("fetch failed", { cause: systemError("ETIMEDOUT", "connect") });
    expect(await policyAt({ ms: 0 }).retryOn(0, error, null)).toBe(true);
  });

  test.each([
    ["from read", "read"],
    ["with no syscall", undefined],
  ])("a plain ETIMEDOUT %s is not retried", async (_label, syscall) => {
    const error = new TypeError("fetch failed", { cause: systemError("ETIMEDOUT", syscall) });
    expect(await policyAt({ ms: 0 }).retryOn(0, error, null)).toBe(false);
  });

  describe("a happy-eyeballs AggregateError", () => {
    const refused = () => systemError("ECONNREFUSED", "connect");
    const connectTimeout = () => systemError("ETIMEDOUT", "connect");

    test.each([
      ["refused on every address", [refused(), refused()]],
      ["a connect timeout on every address", [connectTimeout(), connectTimeout()]],
      ["refused on one address, a connect timeout on the other", [refused(), connectTimeout()]],
    ])("%s is retried", async (_label, errors) => {
      for (const error of aggregateFailed(errors)) {
        expect(await policyAt({ ms: 0 }).retryOn(0, error, null)).toBe(true);
      }
    });

    test.each([
      ["a read timeout on one address", [systemError("ETIMEDOUT", "read"), refused()]],
      ["a reset on one address", [refused(), systemError("ECONNRESET", "read")]],
      ["no inner error", []],
    ])("%s is not retried", async (_label, errors) => {
      for (const error of aggregateFailed(errors)) {
        expect(await policyAt({ ms: 0 }).retryOn(0, error, null)).toBe(false);
      }
    });
  });

  test.each([
    ["a socket closed after the request was sent", fetchFailed("UND_ERR_SOCKET")],
    ["a connection reset", fetchFailed("ECONNRESET")],
    ["a response-header timeout", fetchFailed("UND_ERR_HEADERS_TIMEOUT")],
    ["a body timeout", fetchFailed("UND_ERR_BODY_TIMEOUT")],
    ["an abort", new DOMException("The operation was aborted.", "AbortError")],
    ["a timeout signal", new DOMException("The operation timed out.", "TimeoutError")],
    ["a TypeError with no cause", new TypeError('Headers.append: "a\\nb" is an invalid value.')],
  ])("%s is not retried", async (_label, error) => {
    expect(await policyAt({ ms: 0 }).retryOn(0, error, null)).toBe(false);
  });

  test("a GET, HEAD or OPTIONS with no body, a string or bytes is eligible", () => {
    const bodies = [
      undefined,
      null,
      "",
      "{}",
      new Uint8Array([1]),
      Buffer.from("a"),
      new ArrayBuffer(1),
    ];
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      for (const body of bodies) {
        expect(isRetryEligible(method, body)).toBe(true);
      }
    }
  });

  test("a POST, PUT, PATCH or DELETE is never eligible, whatever its body", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      for (const body of [undefined, "{}", new Uint8Array([1])]) {
        expect(isRetryEligible(method, body)).toBe(false);
      }
    }
  });

  test("a GET with a one-shot body (a stream, a reader or a generator) is not eligible", () => {
    async function* generator() {
      yield "a";
    }
    const oneShot = [
      new ReadableStream(),
      new ReadableStream().getReader(),
      Readable.from(["a"]),
      generator(),
    ];
    for (const body of oneShot) {
      expect(isRetryEligible("GET", body)).toBe(false);
    }
  });
});

describe("a status from the target site is not retried", () => {
  const retriedCodes = [429, 502, 503, 504, 422];

  test.each([true, "true", "TRUE", " true ", 1, "1"])(
    "original_status %j: no status is retried",
    async (on) => {
      for (const code of retriedCodes) {
        const policy = policyAt({ ms: 0 }, { params: { original_status: on } });
        expect(await policy.retryOn(0, null, status(code))).toBe(false);
      }
    },
  );

  test.each([false, "false", 0, "0", "", null, undefined])(
    "original_status %j: the usual statuses are retried",
    async (off) => {
      for (const code of retriedCodes) {
        const policy = policyAt({ ms: 0 }, { params: { original_status: off } });
        expect(await policy.retryOn(0, null, status(code))).toBe(true);
      }
    },
  );

  test.each([
    ["the string '503'", "503"],
    ["a list with spaces", "404, 503"],
    ["an array of strings", ["404", "503"]],
    ["an array of numbers", [404, 503]],
    ["a number", 503],
  ])("allowed_status_codes as %s: a 503 is final, a 502 is retried", async (_label, listed) => {
    const params = { allowed_status_codes: listed };
    expect(await policyAt({ ms: 0 }, { params }).retryOn(0, null, status(503))).toBe(false);
    expect(await policyAt({ ms: 0 }, { params }).retryOn(0, null, status(502))).toBe(true);
  });

  test("allowed_status_codes '422,429': a listed 422 or 429 is final", async () => {
    const params = { allowed_status_codes: "422,429" };
    const other = Response.json({ code: "RESP001" }, { status: 422 });
    expect(await policyAt({ ms: 0 }, { params }).retryOn(0, null, other)).toBe(false);
    expect(await policyAt({ ms: 0 }, { params }).retryOn(0, null, status(429))).toBe(false);
    expect(await policyAt({ ms: 0 }, { params }).retryOn(0, null, status(503))).toBe(true);
  });

  test.each([
    ["original_status", { original_status: true }],
    ["allowed_status_codes", { allowed_status_codes: "503" }],
  ])("a refused connection is still retried with %s", async (_label, params) => {
    const policy = policyAt({ ms: 0 }, { params });
    expect(await policy.retryOn(0, fetchFailed("ECONNREFUSED"), null)).toBe(true);
  });
});

describe("retryPolicy", () => {
  test("stops after `retries` retries", async () => {
    const policy = policyAt({ ms: 0 }, { retries: 2 });
    expect(await policy.retryOn(0, null, status(503))).toBe(true);
    expect(await policy.retryOn(1, null, status(503))).toBe(true);
    expect(await policy.retryOn(2, null, status(503))).toBe(false);
  });

  test("retryMaxWait caps the jitter ceiling", async () => {
    const policy = policyAt({ ms: 0 }, { retryMaxWait: 2, random: () => RANDOM_MAX });
    await policy.retryOn(5, null, status(503));
    expect(policy.retryDelay()).toBeLessThanOrEqual(2000);
  });

  test("retryMaxWait never caps a Retry-After", async () => {
    const policy = policyAt({ ms: 0 }, { retryMaxWait: 5 });
    await policy.retryOn(0, null, status(503, { "Retry-After": "20" }));
    expect(policy.retryDelay()).toBe(20_000);
  });

  test("starts no retry that would pass the budget", async () => {
    const clock = { ms: 0 };
    const policy = policyAt(clock, { retryBudget: 10 });
    clock.ms = 3000;
    expect(await policy.retryOn(0, null, status(503, { "Retry-After": "7" }))).toBe(true);
    clock.ms = 3001;
    expect(await policy.retryOn(1, null, status(503, { "Retry-After": "7" }))).toBe(false);
  });

  test("cancels the body of a response it retries, and leaves a final one unread", async () => {
    const cancelled: string[] = [];
    const response = (name: string, code: number) =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled.push(name);
          },
        }),
        { status: code },
      );

    const policy = policyAt({ ms: 0 }, { retries: 1 });
    expect(await policy.retryOn(0, null, response("retried", 503))).toBe(true);
    expect(await policy.retryOn(1, null, response("last", 503))).toBe(false);
    expect(await policy.retryOn(0, null, response("final", 400))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cancelled).toEqual(["retried"]);
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

  test("waits a Retry-After of 20 s in full, even with retryMaxWait 5", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return calls === 1
          ? new HttpResponse(null, { status: 503, headers: { "Retry-After": "20" } })
          : HttpResponse.json({ ok: 1 });
      }),
    );

    const pending = new ZenRows("API_KEY", { retryMaxWait: 5 }).fetch(url);
    await vi.advanceTimersByTimeAsync(19_999);
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

  test("a 400 is not retried", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return HttpResponse.json({ code: "REQS001" }, { status: 400 });
      }),
    );

    const response = await new ZenRows("API_KEY", { retries: 3 }).fetch(url);

    expect(response.status).toBe(400);
    expect(calls).toBe(1);
  });

  test("a 422 other than no_data_extracted is retried, and the last one comes back readable", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return HttpResponse.json({ code: "RESP001" }, { status: 422 });
      }),
    );

    const pending = new ZenRows("API_KEY").fetch(url);
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;

    expect(calls).toBe(3);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: "RESP001" });
  });

  test("a 500 is not retried", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const response = await new ZenRows("API_KEY", { retries: 3 }).fetch(url);

    expect(response.status).toBe(500);
    expect(calls).toBe(1);
  });

  const retriedAnswers = [
    [503, () => new HttpResponse(null, { status: 503 })],
    [429, () => new HttpResponse(null, { status: 429 })],
    [422, () => HttpResponse.json({ code: "RESP001" }, { status: 422 })],
  ] as const;

  describe.each([
    ["without an Idempotency-Key", {}],
    ["with an Idempotency-Key", { "Idempotency-Key": "order-key" }],
  ])("post() %s", (_label, headers: Record<string, string>) => {
    test.each(retriedAnswers)(
      "is sent once on a %i, even with retries: 3",
      async (code, answer) => {
        const bodies: string[] = [];
        server.use(
          http.post(apiUrl, async ({ request }) => {
            bodies.push(await request.text());
            return answer();
          }),
        );

        const pending = new ZenRows("API_KEY", { retries: 3 }).post(
          url,
          {},
          { headers, data: { order: 1 } },
        );
        await vi.advanceTimersByTimeAsync(60_000);

        expect((await pending).status).toBe(code);
        expect(bodies).toEqual(['{"order":1}']);
      },
    );
  });

  test.each(retriedAnswers)("fetch() is still retried on a %i", async (code, answer) => {
    let calls = 0;
    server.use(
      http.get(apiUrl, () => {
        calls += 1;
        return answer();
      }),
    );

    const pending = new ZenRows("API_KEY", { retries: 3 }).fetch(url);
    await vi.advanceTimersByTimeAsync(60_000);

    expect((await pending).status).toBe(code);
    expect(calls).toBe(4);
  });

  describe("a status from the target site", () => {
    /** Answers every GET with `answer()` and records the query string of each request. */
    function recordGets(answer: () => Response) {
      const queries: URLSearchParams[] = [];
      server.use(
        http.get(apiUrl, ({ request }) => {
          queries.push(new URL(request.url).searchParams);
          return answer();
        }),
      );
      return queries;
    }

    test.each(retriedAnswers)(
      "fetch() with original_status: true is sent once on a %i",
      async (code, answer) => {
        const queries = recordGets(answer);

        const pending = new ZenRows("API_KEY", { retries: 3 }).fetch(url, {
          original_status: true,
        });
        await vi.advanceTimersByTimeAsync(60_000);

        expect((await pending).status).toBe(code);
        expect(queries).toHaveLength(1);
        expect(queries[0]?.get("original_status")).toBe("true");
      },
    );

    test.each([
      ["false", { original_status: false }],
      ["absent", {}],
    ])("fetch() with original_status %s is retried on a 503", async (_label, config) => {
      const queries = recordGets(() => new HttpResponse(null, { status: 503 }));

      const pending = new ZenRows("API_KEY", { retries: 3 }).fetch(url, config);
      await vi.advanceTimersByTimeAsync(60_000);

      expect((await pending).status).toBe(503);
      expect(queries).toHaveLength(4);
    });

    test("extract() with original_status: true is sent once on a 503", async () => {
      const queries = recordGets(() => new HttpResponse(null, { status: 503 }));

      const pending = new ZenRows("API_KEY", { retries: 3 }).extract(url, {
        original_status: true,
      });
      await vi.advanceTimersByTimeAsync(60_000);

      expect((await pending).status).toBe(503);
      expect(queries).toHaveLength(1);
    });

    test("allowed_status_codes '503': a 503 is sent once, a 502 is retried", async () => {
      const client = new ZenRows("API_KEY", { retries: 3 });
      const config = { allowed_status_codes: "503" };

      const once = recordGets(() => new HttpResponse(null, { status: 503 }));
      const first = client.fetch(url, config);
      await vi.advanceTimersByTimeAsync(60_000);
      expect((await first).status).toBe(503);
      expect(once).toHaveLength(1);
      expect(once[0]?.get("allowed_status_codes")).toBe("503");

      const retried = recordGets(() => new HttpResponse(null, { status: 502 }));
      const second = client.fetch(url, config);
      await vi.advanceTimersByTimeAsync(60_000);
      expect((await second).status).toBe(502);
      expect(retried).toHaveLength(4);
    });
  });
});

describe("prepared-domain calls are never retried", () => {
  // Their 429 (`out_of_allowance`) and 503 (`overloaded`, `disabled`) are answers to read, not
  // to resend: the caller gets them on the first attempt, even with retries on.
  const preparedDomains = "https://api.zenrows.com/v1/extract/prepared-domains";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const calls = [
    ["prepareDomain", (client: ZenRows) => client.prepareDomain("www.example.com", [url])],
    ["preparedDomainStatus", (client: ZenRows) => client.preparedDomainStatus("www.example.com")],
  ] as const;

  for (const [name, call] of calls) {
    for (const code of [429, 503]) {
      test(`${name}() rejects on the first ${code}, with the default and with retries: 5`, async () => {
        let requests = 0;
        const answer = () => {
          requests += 1;
          return HttpResponse.json({ code: "x" }, { status: code });
        };
        server.use(
          http.post(preparedDomains, answer),
          http.get(`${preparedDomains}/:domain`, answer),
        );

        for (const client of [new ZenRows("API_KEY"), new ZenRows("API_KEY", { retries: 5 })]) {
          requests = 0;
          const pending = call(client).catch((error: unknown) => error);
          await vi.advanceTimersByTimeAsync(60_000);
          const error = await pending;

          expect(error).toBeInstanceOf(ZenRowsPreparedDomainError);
          expect((error as ZenRowsPreparedDomainError).status).toBe(code);
          expect(requests).toBe(1);
        }
      });
    }
  }
});

describe("retry options are validated", () => {
  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2"])(
    "retries %s is rejected",
    (retries) => {
      expect(() => new ZenRows("API_KEY", { retries: retries as number })).toThrow(
        /retries must be an integer of 0 or more/,
      );
    },
  );

  test.each(["retryMaxWait", "retryBudget"] as const)("%s must be finite and above 0", (name) => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "5"]) {
      expect(() => new ZenRows("API_KEY", { [name]: value as number })).toThrow(
        new RegExp(`${name} must be a finite number of seconds greater than 0`),
      );
    }
  });

  test("valid values and defaults are accepted", () => {
    expect(() => new ZenRows("API_KEY")).not.toThrow();
    expect(
      () => new ZenRows("API_KEY", { retries: 0, retryMaxWait: 0.1, retryBudget: 1 }),
    ).not.toThrow();
  });
});
