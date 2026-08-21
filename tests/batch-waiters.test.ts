import { describe, expect, test } from "vitest";
import { WaiterFailureError, WaiterTimeoutError, pollUntil } from "../src/batch/waiters";

describe("pollUntil", () => {
  test("returns immediately when the first fetch is already done", async () => {
    const result = await pollUntil(() => "done", { isDone: (v) => v === "done" });
    expect(result).toBe("done");
  });

  test("retries until isDone is satisfied", async () => {
    let calls = 0;
    const result = await pollUntil(
      () => {
        calls += 1;
        return calls;
      },
      { isDone: (v) => v >= 3, initialInterval: 0.01, maxInterval: 0.01 },
    );
    expect(result).toBe(3);
    expect(calls).toBe(3);
  });

  test("throws WaiterFailureError when isFailure matches", async () => {
    await expect(
      pollUntil(() => "bad", {
        isDone: () => false,
        isFailure: (v) => v === "bad",
        initialInterval: 0.01,
      }),
    ).rejects.toBeInstanceOf(WaiterFailureError);
  });

  test("throws WaiterTimeoutError once the deadline passes", async () => {
    await expect(
      pollUntil(() => "still-waiting", {
        isDone: () => false,
        timeout: 0.05,
        initialInterval: 0.02,
        maxInterval: 0.02,
      }),
    ).rejects.toBeInstanceOf(WaiterTimeoutError);
  });

  test("backoff never exceeds maxInterval", async () => {
    const intervals: number[] = [];
    let last = Date.now();
    let calls = 0;
    await pollUntil(
      () => {
        const now = Date.now();
        if (calls > 0) intervals.push(now - last);
        last = now;
        calls += 1;
        return calls;
      },
      { isDone: (v) => v >= 4, initialInterval: 0.01, maxInterval: 0.015, backoff: 3, jitter: 0 },
    );
    // With backoff=3 and no cap, interval 2 would be ~0.03s; the cap keeps every interval <= ~0.015s (+ scheduling slack).
    for (const ms of intervals) {
      expect(ms).toBeLessThan(50);
    }
  });
});
