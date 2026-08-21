import type { ProblemJson } from "./types.js";

/**
 * A non-2xx response from the Batch API, decoded as RFC 7807 `application/problem+json`
 * where possible. `code` is the stable Problem `code` member (e.g. `file_input_not_found`) —
 * safe to branch on; defaults to `"internal"` when the body wasn't valid Problem JSON.
 */
export class ZenRowsBatchError extends Error {
  readonly status: number;
  readonly problem: ProblemJson | undefined;
  readonly code: string;
  readonly extras: Record<string, unknown> | undefined;

  constructor(status: number, problem: ProblemJson | undefined, extras?: Record<string, unknown>) {
    const message = problem
      ? `${status} ${problem.title ?? "Error"}: ${problem.detail ?? problem.code ?? "unknown"}`
      : `${status} (no problem body)`;
    super(message);
    this.name = "ZenRowsBatchError";
    this.status = status;
    this.problem = problem;
    this.code = problem?.code ?? "internal";
    this.extras = extras;
  }
}

const PROBLEM_STANDARD_KEYS = new Set(["type", "title", "status", "code", "detail", "instance"]);

/**
 * Parse a Problem+JSON error body. Tolerant of non-JSON bodies (production servers
 * occasionally return a raw error page, e.g. from an edge proxy) — degrades to
 * `undefined` rather than throwing.
 */
export async function parseProblem(
  response: Response,
): Promise<{ problem: ProblemJson | undefined; extras: Record<string, unknown> | undefined }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { problem: undefined, extras: undefined };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { problem: undefined, extras: undefined };
  }
  const record = body as Record<string, unknown>;
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!PROBLEM_STANDARD_KEYS.has(key)) {
      extras[key] = value;
    }
  }
  const problem: ProblemJson = {
    type: typeof record.type === "string" ? record.type : "about:blank",
    title: typeof record.title === "string" ? record.title : "Error",
    status: typeof record.status === "number" ? record.status : response.status,
    code: typeof record.code === "string" ? record.code : "internal",
    detail: typeof record.detail === "string" ? record.detail : undefined,
    instance: typeof record.instance === "string" ? record.instance : undefined,
  };
  return { problem, extras: Object.keys(extras).length ? extras : undefined };
}
