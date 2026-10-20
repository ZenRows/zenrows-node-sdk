import type { ProblemJson } from "./types.js";

/**
 * The `code` values the Batch API sends in an error body, by name. Compare
 * `ZenRowsBatchError.code` (or a task's `error.code`) against these instead of a bare string.
 * The API may add codes, so keep a default branch.
 */
export const BatchErrorCode = {
  // Generic
  /** 400. The request is invalid; a bad task is listed in `extras.invalid_tasks`. */
  InvalidArgument: "invalid_argument",
  /** 404. */
  NotFound: "not_found",
  /** 409. */
  Conflict: "conflict",
  /** 401. The API key is missing or invalid. */
  Unauthenticated: "unauthenticated",
  /** 401. The key is valid but the subscription is not active; fix it in Billing. */
  SubscriptionInactive: "subscription_inactive",
  /** 402. The account is out of credits. */
  PaymentRequired: "payment_required",
  /** 402. The API key reached one of its credit caps; `detail` names the cap and when it resets. */
  ApiKeyCapReached: "api_key_cap_reached",
  /** 403. */
  PermissionDenied: "permission_denied",
  /**
   * 429. An account limit: active jobs (shared with Crawl), scheduled jobs, or the task cap of
   * an open job. It clears only when a job finishes or is deleted, so it is not retried.
   */
  QuotaExceeded: "quota_exceeded",
  /** 500. */
  Internal: "internal",
  /** 501. */
  NotImplemented: "not_implemented",

  // Job, run and task lifecycle (409 unless noted)
  JobNotOpen: "job_not_open",
  RunNotTerminal: "run_not_terminal",
  RunNotStoppable: "run_not_stoppable",
  NoPriorRun: "no_prior_run",
  /** A rerun with a status filter matched no task. */
  NoMatchingTasks: "no_matching_tasks",
  RunHasDescendants: "run_has_descendants",
  LastBatchReceived: "last_batch_received",
  /** The same `Idempotency-Key` was sent with a different body. */
  IdempotencyKeyConflict: "idempotency_key_conflict",
  /** The task is still pending or processing, so it has no content yet. */
  TaskNotReady: "task_not_ready",
  /** 410. The result is past the retention window. */
  ResultExpired: "result_expired",
  /** A partial rerun (`status` filter) more than 10 days after the run started; a full rerun still works. */
  PartialRerunWindowExpired: "partial_rerun_window_expired",

  // HMAC signing keys (409)
  CandidatePending: "candidate_pending",
  NoCandidate: "no_candidate",

  // Input validation (400, usually per task in `invalid_tasks`)
  UnsupportedScheme: "unsupported_scheme",
  MalformedUrl: "malformed_url",
  MissingHost: "missing_host",
  UrlTooLong: "url_too_long",
  MetadataTooLarge: "metadata_too_large",
  MetadataKeyInvalid: "metadata_key_invalid",
  InvalidExternalId: "invalid_external_id",

  // Task method and body (400)
  UnsupportedMethod: "unsupported_method",
  BodyNotAllowed: "body_not_allowed",
  BodyTooLarge: "body_too_large",
  BodyMalformed: "body_malformed",
  MethodParamConflict: "method_param_conflict",

  // CSV file inputs
  /** 404. */
  FileInputNotFound: "file_input_not_found",
  /** 409. */
  FileInputNotUploaded: "file_input_not_uploaded",
  /** 409. */
  FileInputUnsupportedForJobType: "file_input_unsupported_for_job_type",

  // Webhooks (400)
  CallbackUrlMustBeHttps: "callback_url_must_be_https",
  CallbackUrlUnresolvable: "callback_url_unresolvable",
  WebhookSigningRequiresActiveKey: "webhook_signing_requires_active_key",

  // Task level: seen in a failed task's `error.code`
  GatewayUnreachable: "gateway_unreachable",
} as const;

/** One of the `BatchErrorCode` values. */
export type BatchErrorCodeValue = (typeof BatchErrorCode)[keyof typeof BatchErrorCode];

/**
 * A non-2xx response from the Batch API, decoded as RFC 7807 `application/problem+json`
 * where possible. `code` is the stable Problem `code` member (e.g. `file_input_not_found`),
 * safe to branch on against `BatchErrorCode`; it is `"internal"` when the body wasn't valid
 * Problem JSON.
 */
export class ZenRowsBatchError extends Error {
  readonly status: number;
  readonly problem: ProblemJson | undefined;
  readonly code: string;
  readonly extras: Record<string, unknown> | undefined;
  /** The Problem `detail`: a human-readable explanation, when the body had one. */
  readonly detail: string | undefined;
  /** Seconds from the `Retry-After` header, when the response had one. */
  readonly retryAfter: number | undefined;

  constructor(
    status: number,
    problem: ProblemJson | undefined,
    extras?: Record<string, unknown>,
    retryAfter?: number,
  ) {
    const code = problem?.code ?? "internal";
    const message = problem
      ? `${status} ${problem.title ?? "Error"}: ${problem.detail ?? code}`
      : `${status} (no problem body)`;
    super(message);
    this.name = "ZenRowsBatchError";
    this.status = status;
    this.problem = problem && { ...problem, code };
    this.code = code;
    this.extras = extras;
    this.detail = problem?.detail;
    this.retryAfter = retryAfter;
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
    code: typeof record.code === "string" ? record.code : undefined,
    detail: typeof record.detail === "string" ? record.detail : undefined,
    instance: typeof record.instance === "string" ? record.instance : undefined,
  };
  return { problem, extras: Object.keys(extras).length ? extras : undefined };
}
