import type { ProblemJson } from "../batch/types.js";

/** The API's code for an account Crawl is not enabled on (403). */
export const CRAWL_NOT_ENABLED_CODE = "REQS008";

/**
 * A non-2xx response from the Crawl API, decoded as RFC 9457 `application/problem+json`
 * where possible. Branch on `status` and `code` (e.g. `crawl_not_found`, `too_many_crawls`,
 * or `REQS008` when Crawl is not enabled for the account); `code` defaults to
 * `"internal"` when the body wasn't valid Problem JSON.
 */
export class ZenRowsCrawlError extends Error {
  readonly status: number;
  readonly problem: ProblemJson | undefined;
  readonly code: string;
  readonly extras: Record<string, unknown> | undefined;
  /** Seconds from the `Retry-After` header, e.g. 30 on a 429 `too_many_crawls`. */
  readonly retryAfter: number | undefined;

  constructor(
    status: number,
    problem: ProblemJson | undefined,
    extras?: Record<string, unknown>,
    retryAfter?: number,
  ) {
    let message: string;
    if (status === 403 && problem?.code === CRAWL_NOT_ENABLED_CODE) {
      message = `403 Crawl is not enabled for this account (${CRAWL_NOT_ENABLED_CODE})${problem.detail ? `: ${problem.detail}` : ""}`;
    } else if (problem) {
      message = `${status} ${problem.title ?? "Error"}: ${problem.detail ?? problem.code ?? "unknown"}`;
    } else {
      message = `${status} (no problem body)`;
    }
    super(message);
    this.name = "ZenRowsCrawlError";
    this.status = status;
    this.problem = problem;
    this.code = problem?.code ?? "internal";
    this.extras = extras;
    this.retryAfter = retryAfter;
  }
}

/** @internal Builds a `ZenRowsCrawlError` for the shared transport. */
export function crawlError(
  response: Response,
  problem: ProblemJson | undefined,
  extras: Record<string, unknown> | undefined,
): ZenRowsCrawlError {
  const raw = response.headers.get("Retry-After");
  const secs = raw === null ? Number.NaN : Number(raw);
  return new ZenRowsCrawlError(
    response.status,
    problem,
    extras,
    Number.isNaN(secs) || secs < 0 ? undefined : secs,
  );
}
