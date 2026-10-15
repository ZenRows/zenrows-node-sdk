import type { ProblemJson } from "../batch/types.js";

/** Where a domain's Extract preparation stands. Use `status` to decide whether the domain
 * is usable; `state` is for progress display and may gain values later. */
export interface PreparedDomainStatus {
  domain: string;
  status: "preparing" | "ready" | "failed";
  state: "received" | "discovering" | "preparing" | "verifying" | "ready" | "failed" | string;
  /** Per-page-kind progress. Only returned to the account that submitted the domain. */
  roles?: Array<{ role: string; status: string; url?: string; detail?: string }>;
  /** Present when `status` is `"failed"`. */
  failure?: { code: string; detail?: string; slot_consumed: boolean };
  submitted_at: string;
  updated_at: string;
  [key: string]: unknown;
}

/** An RFC 9457 problem from the prepared-domains endpoints, which may carry a `reason`. */
export interface PreparedDomainProblem extends ProblemJson {
  reason?: string;
}

/**
 * A non-2xx answer from `prepareDomain()` or `preparedDomainStatus()`. Branch on `status`
 * and `code`; display `detail`, don't parse it. `code` is the problem's code, for example
 * `invalid_argument` (400), `not_found` (404), `in_progress` (409: a preparation is already
 * running, read its status instead of resubmitting), `out_of_allowance` (429: no preparations
 * left this month), or `overloaded` / `disabled` (503); undefined when the body has none.
 */
export class ZenRowsPreparedDomainError extends Error {
  readonly status: number;
  readonly problem: PreparedDomainProblem | undefined;
  readonly code: string | undefined;
  readonly detail: string | undefined;
  readonly reason: string | undefined;
  /** Seconds from the `Retry-After` header, when the server sent one. */
  readonly retryAfter: number | undefined;

  constructor(status: number, problem: PreparedDomainProblem | undefined, retryAfter?: number) {
    const explanation = problem?.detail ?? problem?.code;
    super(
      problem
        ? `${status} ${problem.title ?? "Prepared-domains request failed"}${explanation ? `: ${explanation}` : ""}`
        : `${status} (no problem body)`,
    );
    this.name = "ZenRowsPreparedDomainError";
    this.status = status;
    this.problem = problem;
    this.code = problem?.code;
    this.detail = problem?.detail;
    this.reason = problem?.reason;
    this.retryAfter = retryAfter;
  }
}

/** @internal Rejects an empty or whitespace-only domain: it would request the list endpoint
 * and read its answer as a status. */
export function checkDomain(domain: unknown): void {
  if (typeof domain !== "string" || domain.trim() === "") {
    throw new TypeError("domain must be a non-empty string");
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await response.json();
    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** @internal Sends one prepared-domains request and returns the parsed status object. */
export async function preparedDomainsRequest(
  url: string,
  init: RequestInit,
): Promise<PreparedDomainStatus> {
  const response = await fetch(url, init);
  const body = await readJson(response);
  if (!response.ok || body === undefined) {
    const raw = response.headers.get("Retry-After");
    // An empty header is missing, not 0 (Number("") is 0).
    const secs = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
    throw new ZenRowsPreparedDomainError(
      response.status,
      response.ok ? undefined : (body as PreparedDomainProblem | undefined),
      Number.isFinite(secs) && secs >= 0 ? secs : undefined,
    );
  }
  return body as PreparedDomainStatus;
}
