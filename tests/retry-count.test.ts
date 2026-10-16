import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ZenRows } from "../src";
import { server } from "./_setup";

describe("retry count", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    { retries: undefined, expectedCalls: 3 },
    { retries: 0, expectedCalls: 1 },
    { retries: 1, expectedCalls: 2 },
    { retries: 2, expectedCalls: 3 },
  ])(
    "retries: $retries makes exactly $expectedCalls call(s) on a 503",
    async ({ retries, expectedCalls }) => {
      let fetchCount = 0;

      server.use(
        http.get("https://api.zenrows.com/v1/", () => {
          fetchCount++;
          return new HttpResponse("Service Unavailable", { status: 503 });
        }),
      );

      const client = new ZenRows("API_KEY", retries === undefined ? {} : { retries });
      const pending = client.get("https://example.com");
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await pending;

      expect(response.status).toBe(503);
      expect(fetchCount).toBe(expectedCalls);
    },
  );
});
