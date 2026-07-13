/**
 * A lazy async sequence with ergonomic helpers.
 *
 * The Batch scanners (`iterJobs`, `iterResults`, `run.results()`, …)
 * page over the network, so they're **async** iterables — and the
 * language's iterator helpers (`.forEach`, `.map`, …) only exist on
 * *sync* iterators today (async-iterator helpers are still a proposal).
 * `AsyncStream` fills that gap without giving up streaming: it's a
 * normal `for await` iterable AND exposes callback-style methods that
 * consume it lazily, one page at a time — never buffering the whole
 * result set (unless you ask, via `toArray`).
 *
 * ```ts
 * await run.results({ status: "successful" }).forEach((row) => {
 *   console.log(row.externalId, row.resultUrl);
 * });
 *
 * // still a plain async iterable:
 * for await (const row of run.results()) { ... }
 * ```
 *
 * Backed by a factory so each consumption starts a fresh scan.
 */
export class AsyncStream<T> implements AsyncIterable<T> {
  constructor(private readonly factory: () => AsyncIterable<T>) {}

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.factory()[Symbol.asyncIterator]();
  }

  /**
   * Call `callback` for each item, in order, awaiting it if it returns
   * a promise (so async work runs sequentially). Streams — items are
   * pulled one at a time, never all buffered.
   */
  async forEach(callback: (item: T, index: number) => unknown): Promise<void> {
    let index = 0;
    for await (const item of this) {
      await callback(item, index);
      index += 1;
    }
  }

  /** Collect every item into an array. Buffers the whole sequence. */
  async toArray(): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this) out.push(item);
    return out;
  }

  /** Lazily transform each item, yielding a new stream (no buffering). */
  map<U>(fn: (item: T, index: number) => U | Promise<U>): AsyncStream<U> {
    const source = this;
    return new AsyncStream<U>(async function* () {
      let index = 0;
      for await (const item of source) {
        yield await fn(item, index);
        index += 1;
      }
    });
  }

  /** Lazily keep items matching `predicate`, yielding a new stream. */
  filter(predicate: (item: T, index: number) => boolean | Promise<boolean>): AsyncStream<T> {
    const source = this;
    return new AsyncStream<T>(async function* () {
      let index = 0;
      for await (const item of source) {
        if (await predicate(item, index)) yield item;
        index += 1;
      }
    });
  }
}
