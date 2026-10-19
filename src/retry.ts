// Retry policy for `fetch()`, `extract()` and `post()`. The same policy ships in every ZenRows
// client: retry only answers that say "try again" and are never charged, retry only requests
// that are safe to send twice, back off with full jitter, and start no retry after the budget.

/** Statuses retried: rate limited, or the gateway or its upstream could not answer. Never charged. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

/**
 * `error.cause.code` values that mean the request never reached the server: the connection was
 * refused, the name did not resolve, the network or host was unreachable, or the connect timed out.
 * Anything else (a reset or close after the request was written, a header or body timeout, an
 * abort, a bad header value) is not retried: the server may have run the request already.
 */
const PRE_SEND_ERROR_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** Methods that are always safe to send again. Others need an `Idempotency-Key` header. */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export const DEFAULT_RETRIES = 2;
/** The longest one backoff wait may be, in seconds. */
export const DEFAULT_RETRY_MAX_WAIT_SECONDS = 30;
/** No retry starts once the time spent plus the next wait would pass this, in seconds. */
export const DEFAULT_RETRY_BUDGET_SECONDS = 90;

const BACKOFF_MIN_MS = 250;
const BACKOFF_BASE_MS = 1000;
// A Retry-After is clamped to this range. The cap is fixed and does not depend on retryMaxWait.
const RETRY_AFTER_MIN_MS = 250;
const RETRY_AFTER_MAX_MS = 30_000;

export interface RetryPolicyOptions {
  /** Retries after the first try. 0 turns retries off. */
  retries: number;
  /** The longest one jitter wait may be, in seconds. It never caps a `Retry-After`. */
  retryMaxWait: number;
  /** No retry starts once the time spent plus the next wait would pass this, in seconds. */
  retryBudget: number;
  /**
   * When the logical call's first try started, in `now()` milliseconds. A fallback request that
   * belongs to the same call passes the first request's start, so it gets no fresh budget.
   */
  startedAt?: number;
  /** Clock in milliseconds; tests replace it. */
  now?: () => number;
  /** Uniform random number in [0, 1); tests replace it. */
  random?: () => number;
}

/** Throws a `RangeError` for a retry option the policy cannot honour, instead of clamping it. */
export function validateRetryOptions(options: {
  retries?: unknown;
  retryMaxWait?: unknown;
  retryBudget?: unknown;
}): void {
  const { retries, retryMaxWait, retryBudget } = options;
  if (retries !== undefined && !(Number.isInteger(retries) && (retries as number) >= 0)) {
    throw new RangeError(`retries must be an integer of 0 or more, got ${String(retries)}`);
  }
  for (const [name, value] of [
    ["retryMaxWait", retryMaxWait],
    ["retryBudget", retryBudget],
  ] as const) {
    if (value !== undefined && !(Number.isFinite(value) && (value as number) > 0)) {
      throw new RangeError(
        `${name} must be a finite number of seconds greater than 0, got ${String(value)}`,
      );
    }
  }
}

/** True when a response is Extract's 422 `no_data_extracted`: Extract knows this kind
 * of page but found no data on it. The request is not charged and the client never
 * retries it, since another try returns the same answer. Reads via `.clone()`, so the
 * original response body is left unconsumed for the caller. */
export async function isNoDataExtracted(response: Response): Promise<boolean> {
  if (response.status !== 422) return false;
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body?.code === "string" && body.code.toLowerCase() === "no_data_extracted";
  } catch {
    return false;
  }
}

/** True when the body can be sent again unchanged. A one-shot stream cannot. */
function isReplayableBody(body: unknown): boolean {
  return (
    body === undefined ||
    body === null ||
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof URLSearchParams ||
    body instanceof Blob
  );
}

/**
 * True when a request is safe to send more than once. GET, HEAD and OPTIONS always are. Any
 * other method is only with an `Idempotency-Key` header and a body that can be sent again.
 */
export function isRetryEligible(
  method: string,
  headers: Record<string, string>,
  body: unknown,
): boolean {
  if (IDEMPOTENT_METHODS.has(method.toUpperCase())) return true;
  const hasIdempotencyKey = Object.entries(headers).some(
    ([name, value]) => name.toLowerCase() === "idempotency-key" && value.trim() !== "",
  );
  return hasIdempotencyKey && isReplayableBody(body);
}

/** True when fetch failed before the request was written to the server (see `PRE_SEND_ERROR_CODES`). */
function isPreSendFailure(error: unknown): boolean {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && PRE_SEND_ERROR_CODES.has(code);
}

/** True when the answer says "try again": 429, 502, 503, 504, or a 422 other than `no_data_extracted`. */
async function isRetryableResponse(response: Response): Promise<boolean> {
  if (RETRYABLE_STATUSES.has(response.status)) return true;
  if (response.status === 422) return !(await isNoDataExtracted(response));
  return false;
}

/** Milliseconds from a `Retry-After` in whole seconds, clamped to [0.25 s, 30 s]. Undefined otherwise (an HTTP date too). */
export function retryAfterMs(response: Response | null): number | undefined {
  const raw = response?.headers.get("Retry-After")?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Math.min(Math.max(Number(raw) * 1000, RETRY_AFTER_MIN_MS), RETRY_AFTER_MAX_MS);
}

/** Full jitter for retry `attempt` (0-based): uniform(0.25 s, max(0.25 s, min(maxWait, 1 s * 2^attempt))). */
export function backoffMs(attempt: number, maxWaitMs: number, random: () => number): number {
  const ceiling = Math.max(BACKOFF_MIN_MS, Math.min(maxWaitMs, BACKOFF_BASE_MS * 2 ** attempt));
  return BACKOFF_MIN_MS + random() * (ceiling - BACKOFF_MIN_MS);
}

/**
 * The `retryOn` and `retryDelay` pair for one request through fetch-retry. Build one per
 * request: it remembers when the call started and the wait it chose in `retryOn`, which
 * fetch-retry then reads through `retryDelay`.
 */
export function retryPolicy(options: RetryPolicyOptions) {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const maxWaitMs = options.retryMaxWait * 1000;
  const budgetMs = options.retryBudget * 1000;
  const startedAt = options.startedAt ?? now();
  let nextDelayMs = 0;

  return {
    async retryOn(
      attempt: number,
      error: Error | null,
      response: Response | null,
    ): Promise<boolean> {
      if (attempt >= options.retries) return false;
      if (error) {
        if (!isPreSendFailure(error)) return false;
      } else if (!response || !(await isRetryableResponse(response))) {
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
