/**
 * RFC 7807 Problem JSON → a friendly `Error` subclass.
 *
 * The Batch API returns errors as `application/problem+json`. We
 * surface them as {@link BatchApiError} with a structured
 * {@link ProblemDetail} plus a flat `code` shortcut, so callers can
 * branch on a stable string without indexing into a body:
 *
 * ```ts
 * try {
 *   await client.getJob("does-not-exist");
 * } catch (err) {
 *   if (err instanceof BatchApiError && err.code === "not_found") { ... }
 *   throw err;
 * }
 * ```
 */

/** Decoded RFC 7807 Problem body. */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  /** Any non-standard members (e.g. `invalid_tasks`) kept verbatim. */
  extras?: Record<string, unknown>;
}

const STANDARD_KEYS = new Set(["type", "title", "status", "code", "detail", "instance"]);

/** Parse a Problem body. Returns `null` if the body isn't JSON. */
export function parseProblem(status: number, raw: string): ProblemDetail | null {
  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const obj = body as Record<string, unknown>;
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!STANDARD_KEYS.has(k)) extras[k] = v;
  }
  return {
    type: typeof obj.type === "string" ? obj.type : "about:blank",
    title: typeof obj.title === "string" ? obj.title : "Error",
    status: typeof obj.status === "number" ? obj.status : status,
    code: typeof obj.code === "string" ? obj.code : "internal",
    detail: typeof obj.detail === "string" ? obj.detail : undefined,
    instance: typeof obj.instance === "string" ? obj.instance : undefined,
    extras: Object.keys(extras).length ? extras : undefined,
  };
}

/**
 * A non-2xx response from the Batch API.
 *
 * `code` is the RFC 7807 `code` member (e.g. `file_input_not_found`,
 * `idempotency_key_conflict`). Stable; safe to branch on.
 */
export class BatchApiError extends Error {
  readonly statusCode: number;
  readonly problem: ProblemDetail | null;
  readonly code: string;
  readonly raw: string;

  constructor(statusCode: number, problem: ProblemDetail | null, raw: string) {
    const message = problem
      ? `${statusCode} ${problem.title}: ${problem.detail ?? problem.code}`
      : `${statusCode} (no problem body)`;
    super(message);
    this.name = "BatchApiError";
    this.statusCode = statusCode;
    this.problem = problem;
    this.code = problem ? problem.code : "internal";
    this.raw = raw;
    // Restore prototype chain for `instanceof` across transpile targets.
    Object.setPrototypeOf(this, BatchApiError.prototype);
  }

  static fromResponse(statusCode: number, raw: string): BatchApiError {
    return new BatchApiError(statusCode, parseProblem(statusCode, raw), raw);
  }
}
