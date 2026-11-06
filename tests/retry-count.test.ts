import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ZenRows } from "../src";
import { server } from "./_setup";

describe("retry count", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Every `retries` value 2.6.0 accepted still builds a client and keeps its retry count,
  // except NaN, Infinity and other non-numbers: 2.6.0 retried them without limit.
  test.each([
    { retries: undefined, requests: 1 },
    { retries: null, requests: 1 },
    { retries: "", requests: 1 },
    { retries: false, requests: 1 },
    { retries: -1, requests: 1 },
    { retries: 0, requests: 1 },
    { retries: 1, requests: 2 },
    { retries: 2, requests: 3 },
    { retries: true, requests: 2 },
    { retries: "2", requests: 3 },
    { retries: " 3 ", requests: 4 },
    { retries: 0.5, requests: 2 },
    { retries: 1.5, requests: 3 },
    { retries: Number.NaN, requests: 1, warns: true },
    { retries: Number.POSITIVE_INFINITY, requests: 1, warns: true },
    { retries: "abc", requests: 1, warns: true },
  ])(
    "retries $retries sends $requests request(s) on a 503",
    async ({ retries, requests, warns }) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      let calls = 0;
      server.use(
        http.get("https://api.zenrows.com/v1/", () => {
          calls += 1;
          return new HttpResponse(null, { status: 503 });
        }),
      );

      const client = new ZenRows("API_KEY", { retries: retries as number });
      const pending = client.fetch("https://example.com");
      await vi.advanceTimersByTimeAsync(10_000);

      expect((await pending).status).toBe(503);
      expect(calls).toBe(requests);
      expect(warn).toHaveBeenCalledTimes(warns ? 1 : 0);
      if (warns)
        expect(warn.mock.calls[0]?.[0]).toMatch(/not a valid retry count, retries are off/);
    },
  );
});
