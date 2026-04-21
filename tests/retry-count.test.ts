import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { ZenRows } from "../src";
import { server } from "./_setup";

describe("retryOn off-by-one fix", () => {
  test.each([
    { retries: 0, expectedCalls: 1 },
    { retries: 1, expectedCalls: 2 },
    { retries: 2, expectedCalls: 3 },
  ])(
    "retries: $retries should make exactly $expectedCalls fetch call(s) on 422",
    async ({ retries, expectedCalls }) => {
      let fetchCount = 0;

      server.use(
        http.get("https://api.zenrows.com/v1/", () => {
          fetchCount++;
          return new HttpResponse("Could Not Get Content", { status: 422 });
        }),
      );

      const client = new ZenRows("API_KEY", { retries });
      const response = await client.get("https://example.com");

      expect(response.status).toBe(422);
      expect(fetchCount).toBe(expectedCalls);
    },
  );
});
