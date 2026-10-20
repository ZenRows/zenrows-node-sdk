/**
 * A server-extensible string enum: the listed values autocomplete, but the server may
 * return values not listed (the Batch API marks these `x-extensible-enum`). Response fields
 * use `Extensible<...>`, so callers must handle an unknown value. The named types stay closed
 * so they keep working as request input.
 */
export type Extensible<T extends string> = T | (string & {});

export type JobType = "regular" | "scheduled";
export type JobStatus = "open" | "closed" | "deleted";
export type ScheduleState = "active" | "paused";
export type RunStatus = "pending" | "running" | "completed" | "failed" | "stopped" | "deleted";
/**
 * `expired`: a successful task whose result is past the retention window (14 days by
 * default). The row has no `result_url`, and its content endpoint answers 410
 * `result_expired`. A `status: "successful"` filter still matches expired rows.
 */
export type TaskStatus = "pending" | "processing" | "successful" | "failed" | "expired";
export type PauseState = "active" | "paused";
export type IngestStatus = "pending" | "done";
export type ExportStatus = "pending" | "running" | "completed" | "failed";
/** What started a run: `manual` (a submit or rerun through the API) or `scheduled` (a schedule fired). */
export type RunTrigger = "manual" | "scheduled";
/** HTTP method a task fetches its URL with. `GET` is the default. */
export type TaskMethod = "GET" | "POST";
/**
 * Why a run auto-failed (`status == "failed"`).
 * - `insufficient_credits` — the account is out of credits.
 * - `subscription_inactive` — the subscription is not active.
 * - `api_key_cap_reached` — the job's API key reached one of its credit caps; resolves when
 *   that cap's window resets or the cap is raised. `Run.failure_detail` says which.
 */
export type RunFailureReason =
  | "insufficient_credits"
  | "subscription_inactive"
  | "api_key_cap_reached";

export interface Spend {
  credits: number;
  cost: number;
}

/** @deprecated Results listings never return per-task spend; see `TaskHistoryEvent.spend`. */
export interface TaskSpend {
  total: Spend;
  last_attempt: Spend;
}

export interface RunStats {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  failure_reasons?: Record<string, number>;
  spend?: Spend;
}

export interface WebhookConfig {
  url: string;
  signature: boolean;
}

export interface JobSchedule {
  at?: string;
  rate?: { every: number; unit: "minute" | "hour" | "day" };
  calendar?: {
    times_of_day: string[];
    cadence: { daily?: object; weekly?: { days: string[] }; monthly?: { days: number[] } };
  };
  timezone?: string;
}

export interface Run {
  run_id: string;
  job_id: string;
  run_sequence: number;
  status: Extensible<RunStatus>;
  /** What started this run. */
  trigger?: Extensible<RunTrigger>;
  stats: RunStats;
  last_batch_received?: boolean;
  pause_state?: PauseState;
  ingest_status?: Extensible<IngestStatus>;
  failure_reason?: Extensible<RunFailureReason>;
  /** Human-readable explanation of `failure_reason` (e.g. which cap, and when it resets, UTC). */
  failure_detail?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Job {
  job_id: string;
  type: JobType;
  status: Extensible<JobStatus>;
  format?: string;
  zenrows_params?: Record<string, string>;
  external_id?: string;
  name?: string;
  metadata?: Record<string, string>;
  schedule?: JobSchedule;
  next_scheduled_run?: string;
  schedule_state?: ScheduleState;
  webhook?: WebhookConfig;
  latest_run?: Run;
  created_at?: string;
  updated_at?: string;
}

export interface ListJobsResponse {
  jobs: Job[];
  next_cursor?: string;
}

export interface ListJobRunsResponse {
  runs: Run[];
  next_cursor?: string;
}

export interface SubmitJobResponse {
  job_id: string;
  status: Extensible<JobStatus>;
  latest_run?: Run;
  accepted_tasks: number;
  webhook?: WebhookConfig;
}

export interface AddTasksResponse {
  accepted_tasks: number;
  job_status: Extensible<JobStatus>;
  latest_run: Run;
}

export interface RerunJobResponse {
  job_id: string;
  status: Extensible<JobStatus>;
  latest_run: Run;
  rerun_of?: string;
  retried_tasks: number;
  inherited_tasks: number;
}

export interface ProblemJson {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  instance?: string;
}

export interface TaskResult {
  task_id: string;
  external_id?: string;
  run_id: string;
  url: string;
  metadata?: Record<string, string>;
  method?: TaskMethod;
  status: Extensible<TaskStatus>;
  type?: string;
  result_url?: string;
  error?: ProblemJson;
  source_run_id?: string;
  /** When the task row was created (RFC 3339). */
  created_at?: string;
  /** When the task row last changed, for example when an attempt settled (RFC 3339). */
  updated_at?: string;
  /**
   * @deprecated Never set: results listings do not return per-task spend. Read per-attempt
   * spend from `getTaskHistory()`, or the run total from `run.stats.spend`.
   */
  spend?: TaskSpend;
}

export interface ListResultsResponse {
  results: TaskResult[];
  next_cursor?: string;
}

export interface TaskHistoryEvent {
  started_at: string;
  ended_at: string;
  attempt: number;
  error?: ProblemJson;
  spend?: Spend;
}

export interface TaskHistoryResponse {
  events: TaskHistoryEvent[];
}

export interface StartExportResponse {
  export_id: string;
  status: Extensible<ExportStatus>;
  created_at: string;
  expires_at: string;
}

export interface Export {
  export_id: string;
  status: Extensible<ExportStatus>;
  error?: string;
  download_url?: string;
  created_at: string;
  expires_at: string;
}

export interface FileInputUploadTarget {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
  expires_at: string;
}

export interface CreateJobInputResponse {
  file_input_id: string;
  upload: FileInputUploadTarget;
  expires_at: string;
}

export interface HMACKeyMeta {
  kid: string;
  created_at: string;
}

export interface HMACKeyList {
  active?: HMACKeyMeta;
  candidate?: HMACKeyMeta;
}

export interface HMACKeyCreated {
  kid: string;
  secret: string;
  created_at: string;
}

export interface HMACKeyFinalized {
  active_kid: string;
  created_at: string;
}

export interface TestWebhookResponse {
  delivered: boolean;
  event_id: string;
  status_code?: number;
  error?: string;
  elapsed_ms: number;
}

/** Event types a Batch webhook delivers. `webhook.test` comes only from `testWebhook()`. */
export type WebhookEventType = "run.completed" | "run.failed" | "webhook.test";

/**
 * The JSON body of a Batch webhook delivery (`schema: "zenrows.webhook/v1"`). Verify the
 * raw body with `verifyWebhookSignature()` before parsing it, and deduplicate deliveries on
 * `event_id` (also sent as the `X-ZenRows-Event-Id` header): a delivery can repeat.
 */
export interface WebhookEvent {
  schema: Extensible<"zenrows.webhook/v1">;
  event_id: string;
  event_type: Extensible<WebhookEventType>;
  /** When the event was queued (RFC 3339). */
  occurred_at: string;
  job_id: string;
  external_id?: string;
  metadata?: Record<string, string>;
  run_id: string;
  run_sequence: number;
  /** The run's counters when the event was queued. */
  stats?: RunStats;
  /** Set on `run.failed` only. */
  failure_reason?: Extensible<RunFailureReason>;
  /** Set on `run.failed` only. */
  failure_detail?: string;
}
