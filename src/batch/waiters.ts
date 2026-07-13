/**
 * Polling helpers used by the client's `waitForRun` / `waitForExport`
 * and the handle `.wait()` methods.
 *
 * A *waiter* polls a resource until it reaches a target state or a
 * timeout/error fires. Backoff is jittered exponential (capped) so
 * short jobs don't pay a multi-second cadence and long ones don't
 * hammer the API.
 */

/** Raised when a waiter's `timeout` elapsed before the target state. */
export class WaiterTimeout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaiterTimeout";
    Object.setPrototypeOf(this, WaiterTimeout.prototype);
  }
}

/** Raised when the resource entered a `isFailure` state. */
export class WaiterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaiterError";
    Object.setPrototypeOf(this, WaiterError.prototype);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface PollOptions<T> {
  fetch: () => Promise<T>;
  isDone: (value: T) => boolean;
  isFailure?: (value: T) => boolean;
  /** Called after every fetch — used to drive progress callbacks. */
  onPoll?: (value: T) => void;
  /** Seconds. */
  timeout?: number;
  initialInterval?: number;
  maxInterval?: number;
  backoff?: number;
  jitter?: number;
}

/**
 * Generic poll loop.
 *
 * Calls `fetch()` repeatedly until `isDone(value)` (resolves the
 * value) or `isFailure(value)` (rejects with {@link WaiterError}), or
 * `timeout` seconds elapse (rejects with {@link WaiterTimeout}).
 *
 * The wait between calls starts at `initialInterval`, multiplies by
 * `backoff`, caps at `maxInterval`, and is jittered by ±`jitter`
 * fraction so concurrent waiters don't synchronise into a
 * thundering herd.
 */
export async function pollUntil<T>({
  fetch,
  isDone,
  isFailure,
  onPoll,
  timeout = 300,
  initialInterval = 1,
  maxInterval = 15,
  backoff = 1.5,
  jitter = 0.2,
}: PollOptions<T>): Promise<T> {
  const deadline = Date.now() + timeout * 1000;
  let interval = initialInterval;
  for (;;) {
    const value = await fetch();
    onPoll?.(value);
    if (isDone(value)) return value;
    if (isFailure?.(value)) {
      throw new WaiterError("waiter: resource entered failure state");
    }
    const now = Date.now();
    if (now >= deadline) {
      throw new WaiterTimeout(`waiter: timed out after ${timeout.toFixed(1)}s waiting for target`);
    }
    // Jittered sleep, but never overshoot the deadline.
    let seconds = Math.min(interval, (deadline - now) / 1000);
    seconds = seconds * (1 + (Math.random() * 2 - 1) * jitter);
    if (seconds > 0) await sleep(seconds * 1000);
    interval = Math.min(interval * backoff, maxInterval);
  }
}
