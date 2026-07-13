import { describe, expect, test } from "vitest";
import { AsyncStream } from "../../src/batch/stream";

function stream<T>(items: T[]): AsyncStream<T> {
  return new AsyncStream(async function* () {
    for (const item of items) yield item;
  });
}

describe("AsyncStream", () => {
  test("forEach visits every item in order with an index", async () => {
    const seen: [number, number][] = [];
    await stream([10, 20, 30]).forEach((item, i) => {
      seen.push([i, item]);
    });
    expect(seen).toEqual([
      [0, 10],
      [1, 20],
      [2, 30],
    ]);
  });

  test("forEach awaits async callbacks sequentially", async () => {
    const order: number[] = [];
    await stream([1, 2, 3]).forEach(async (item) => {
      await new Promise((r) => setTimeout(r, 1));
      order.push(item);
    });
    expect(order).toEqual([1, 2, 3]);
  });

  test("is still a plain async iterable (for await)", async () => {
    const out: number[] = [];
    for await (const item of stream([1, 2, 3])) out.push(item);
    expect(out).toEqual([1, 2, 3]);
  });

  test("toArray buffers the whole sequence", async () => {
    expect(await stream(["a", "b"]).toArray()).toEqual(["a", "b"]);
  });

  test("map and filter are lazy and chainable", async () => {
    const result = await stream([1, 2, 3, 4])
      .filter((n) => n % 2 === 0)
      .map((n) => n * 10)
      .toArray();
    expect(result).toEqual([20, 40]);
  });

  test("re-iterable: each consumption starts a fresh scan", async () => {
    const s = stream([1, 2]);
    expect(await s.toArray()).toEqual([1, 2]);
    expect(await s.toArray()).toEqual([1, 2]);
  });
});
