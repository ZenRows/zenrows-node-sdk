// Retry policy for `fetch()`, `extract()` and `post()`. The same policy ships in every ZenRows
// client: retry only answers that say "try again" and are never charged, back off with full
// jitter, and give up once a total time budget is spent.

/** Statuses retried: rate limited, or the gateway or its upstream could not answer. Never charged. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

export const DEFAULT_RETRIES = 2;
/** The longest one backoff wait may be, in seconds. */
export const DEFAULT_RETRY_MAX_WAIT_SECONDS = 30;
/** No retry starts once the request plus the next wait would pass this, in seconds. */
export const DEFAULT_RETRY_BUDGET_SECONDS = 90;

const BACKOFF_MIN_MS = 250;
const BACKOFF_BASE_MS = 1000;
// A Retry-After above this waits only this long, so a large server value cannot hang a call.
const RETRY_AFTER_CAP_MS = 30_000;

export interface RetryPolicyOptions {
  /** Retries after the first try. 0 turns retries off. */
  retries: number;
  /** The longest one backoff wait may be, in seconds. */
  retryMaxWait: number;
  /** Total time a request and its retries may take before no retry starts, in seconds. */
  retryBudget: number;
  /** Clock in milliseconds; tests replace it. */
  now?: () => number;
  /** Uniform random number in [0, 1); tests replace it. */
  random?: () => number;
}

/** Milliseconds from a `Retry-After` in whole seconds, capped. Undefined otherwise (an HTTP date too). */
function retryAfterMs(response: Response | null): number | undefined {
  const raw = response?.headers.get("Retry-After")?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Math.min(Number(raw) * 1000, RETRY_AFTER_CAP_MS);
}

/** Full jitter for retry `attempt` (0-based): uniform(0.25 s, min(maxWait, 1 s * 2^attempt)). */
function backoffMs(attempt: number, maxWaitMs: number, random: () => number): number {
  const ceiling = Math.max(BACKOFF_MIN_MS, Math.min(maxWaitMs, BACKOFF_BASE_MS * 2 ** attempt));
  return BACKOFF_MIN_MS + random() * (ceiling - BACKOFF_MIN_MS);
}

/** A timeout or a caller's abort: the server may still be running the request and charge it. */
function isAbort(error: Error): boolean {
  return error.name === "AbortError" || error.name === "TimeoutError";
}

/**
 * The `retryOn` and `retryDelay` pair for one request through fetch-retry. Build one per
 * request: it remembers when the request started and the wait it chose in `retryOn`, which
 * fetch-retry then reads through `retryDelay`.
 */
export function retryPolicy(options: RetryPolicyOptions) {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const maxWaitMs = options.retryMaxWait * 1000;
  const budgetMs = options.retryBudget * 1000;
  const startedAt = now();
  let nextDelayMs = 0;

  return {
    retryOn(attempt: number, error: Error | null, response: Response | null): boolean {
      if (attempt >= options.retries) return false;
      if (error) {
        if (isAbort(error)) return false;
      } else if (!response || !RETRYABLE_STATUSES.has(response.status)) {
        return false;
      }

      const delay = retryAfterMs(response) ?? backoffMs(attempt, maxWaitMs, random);
      if (now() - startedAt + delay > budgetMs) return false;
      nextDelayMs = delay;
      // The retried answer is dropped; free its connection instead of waiting for GC.
      response?.body?.cancel().catch(() => {});
      return true;
    },
    retryDelay(): number {
      return nextDelayMs;
    },
  };
}
