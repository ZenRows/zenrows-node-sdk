// Retries for fetch(), get() and extract(), by the shared retry policy. The client turns them on
// only for a GET and only when `retries` is above 0; post() is never retried.

const RETRY_STATUSES = new Set([429, 502, 503, 504]);

/** `error.cause.code` values that mean the request never reached the server. */
const CONNECT_ERRORS = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export interface RetryOptions {
  retries: number;
  /** Seconds. */
  retryMaxWait: number;
  /** Seconds. */
  retryBudget: number;
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

/** Reads the client options. `retries` counts as earlier versions compared it: a numeric string
 * is its number, a fraction rounds up, 0 or less is off. A value that is not a number, or
 * Infinity, was retried without limit there; it now turns retries off, with a warning. */
export function retryOptions(config: {
  retries?: unknown;
  retryMaxWait?: unknown;
  retryBudget?: unknown;
}): RetryOptions {
  let retries = Number(config.retries ?? 0);
  if (Number.isNaN(retries) || retries === Number.POSITIVE_INFINITY) {
    console.warn(
      `zenrows: retries ${String(config.retries)} is not a valid retry count, retries are off`,
    );
    retries = 0;
  }
  return {
    retries: Math.max(0, Math.ceil(retries)),
    retryMaxWait: seconds("retryMaxWait", config.retryMaxWait, 30),
    retryBudget: seconds("retryBudget", config.retryBudget, 90),
  };
}

function seconds(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (Number.isFinite(value) && (value as number) > 0) return value as number;
  throw new RangeError(`${name} must be a finite number of seconds above 0, got ${String(value)}`);
}

function isConnectFailure(error: unknown): boolean {
  const { code, syscall } = (error ?? {}) as { code?: unknown; syscall?: unknown };
  return CONNECT_ERRORS.has(code as string) || (code === "ETIMEDOUT" && syscall === "connect");
}

/** True when fetch failed before the request was sent. When Node tries several addresses, the
 * cause is an AggregateError and every inner error must be a connect failure. */
function isPreSendFailure(error: Error): boolean {
  const cause = (error as { cause?: { errors?: unknown } }).cause;
  const inner = cause?.errors;
  if (Array.isArray(inner)) return inner.length > 0 && inner.every(isConnectFailure);
  return isConnectFailure(cause);
}

/** True for 429, 502, 503, 504, or a 422 other than `no_data_extracted`, unless the status is
 * the target site's own answer (`original_status`, `allowed_status_codes`). */
async function isRetryableAnswer(response: Response, params: Record<string, unknown>) {
  const original = String(params.original_status ?? "")
    .trim()
    .toLowerCase();
  const allowed = String(params.allowed_status_codes ?? "").split(",");
  if (original === "true" || original === "1") return false;
  if (allowed.some((code) => code.trim() === String(response.status))) return false;
  if (RETRY_STATUSES.has(response.status)) return true;
  return response.status === 422 && !(await isNoDataExtracted(response));
}

/** `Retry-After` in whole seconds, clamped to 0.25-30 s; otherwise full jitter. */
export function retryWaitMs(attempt: number, response: Response | null, maxWaitMs: number): number {
  const retryAfter = response?.headers.get("Retry-After")?.trim();
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Math.max(Number(retryAfter) * 1000, 250), 30_000);
  }
  const ceiling = Math.max(250, Math.min(maxWaitMs, 1000 * 2 ** attempt));
  return 250 + Math.random() * (ceiling - 250);
}

/** fetch-retry's `retryOn` and `retryDelay` for one request. `retryOn` picks the wait, so it
 * can refuse a retry that would pass the budget. */
export function retryPolicy(options: RetryOptions, params: Record<string, unknown> = {}) {
  const startedAt = Date.now();
  let waitMs = 0;
  return {
    async retryOn(attempt: number, error: Error | null, response: Response | null) {
      if (attempt >= options.retries) return false;
      const retryable = error
        ? isPreSendFailure(error)
        : await isRetryableAnswer(response as Response, params);
      if (!retryable) return false;
      waitMs = retryWaitMs(attempt, response, options.retryMaxWait * 1000);
      if (Date.now() - startedAt + waitMs > options.retryBudget * 1000) return false;
      // The dropped answer would hold its connection until garbage collection.
      response?.body?.cancel().catch(() => {});
      return true;
    },
    retryDelay: () => waitMs,
  };
}
