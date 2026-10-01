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
export type TaskStatus = "pending" | "successful" | "failed";
export type PauseState = "active" | "paused";
export type IngestStatus = "pending" | "done";
export type ExportStatus = "pending" | "running" | "completed" | "failed";

export interface Spend {
  credits: number;
  cost: number;
}

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
  stats: RunStats;
  last_batch_received?: boolean;
  pause_state?: PauseState;
  ingest_status?: Extensible<IngestStatus>;
  failure_reason?: Extensible<"insufficient_credits" | "subscription_inactive">;
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
  method?: "GET" | "POST";
  status: Extensible<TaskStatus>;
  type?: string;
  result_url?: string;
  error?: ProblemJson;
  source_run_id?: string;
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
