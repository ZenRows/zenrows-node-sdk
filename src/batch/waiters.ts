/** Raised when a waiter's `timeout` elapsed before the target state was reached. */
export class WaiterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaiterTimeoutError";
  }
}

/** Raised when the resource entered one of the caller's `isFailure` states. */
export class WaiterFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaiterFailureError";
  }
}

export interface PollUntilOptions<T> {
  isDone(value: T): boolean;
  isFailure?(value: T): boolean;
  timeout?: number;
  initialInterval?: number;
  maxInterval?: number;
  backoff?: number;
  jitter?: number;
}

/**
 * Generic poll loop. Calls `fetch()` repeatedly until `isDone(value)` (returns the value),
 * `isFailure(value)` (throws `WaiterFailureError`), or `timeout` seconds elapse (throws
 * `WaiterTimeoutError`). The wait between calls starts at `initialInterval`, multiplies by
 * `backoff` each iteration, caps at `maxInterval`, and is jittered by ±`jitter` fraction so
 * concurrent waiters don't synchronise into thundering-herd patterns against the API.
 */
export async function pollUntil<T>(
  fetch: () => Promise<T> | T,
  {
    isDone,
    isFailure,
    timeout = 300,
    initialInterval = 1,
    maxInterval = 15,
    backoff = 1.5,
    jitter = 0.2,
  }: PollUntilOptions<T>,
): Promise<T> {
  const deadline = Date.now() + timeout * 1000;
  let interval = initialInterval;
  while (true) {
    const value = await fetch();
    if (isDone(value)) {
      return value;
    }
    if (isFailure?.(value)) {
      throw new WaiterFailureError(
        `waiter: resource entered failure state (${JSON.stringify(value)})`,
      );
    }
    const now = Date.now();
    if (now >= deadline) {
      throw new WaiterTimeoutError(`waiter: timed out after ${timeout}s waiting for target state`);
    }
    const remainingSeconds = (deadline - now) / 1000;
    const sleepSeconds =
      Math.min(interval, remainingSeconds) * (1 + jitter * (Math.random() * 2 - 1));
    if (sleepSeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
    }
    interval = Math.min(interval * backoff, maxInterval);
  }
}
