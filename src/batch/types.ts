/**
 * Public, camelCase types for the Batch API — the ergonomic mirror of
 * the generated wire schema.
 *
 * Everything here is derived from `schema.ts` (regenerated from
 * `docs/openapi.yaml` via `pnpm generate`) through the {@link Camelize}
 * type transform, so the two never drift: change the spec, regenerate,
 * and these follow. Do not hand-edit field names — edit the spec.
 *
 * The runtime counterpart lives in `case.ts`; the transport applies it
 * to every request/response so these camelCase shapes are what callers
 * actually receive.
 */

import type { Camelize } from "./case.js";
import type { components } from "./schema.js";

type S = components["schemas"];

// ----- enums (string-literal unions; values are casing-agnostic) -----

export type JobType = S["JobType"];
export type JobStatus = S["JobStatus"];
export type ScheduleState = S["ScheduleState"];
export type RunTrigger = S["RunTrigger"];
export type RunStatus = S["RunStatus"];
export type TaskStatus = S["TaskStatus"];
export type ResultType = S["ResultType"];
export type Format = S["Format"];
export type ExportStatus = S["ExportStatus"];
export type IngestStatus = NonNullable<S["Run"]["ingest_status"]>;
export type PauseState = NonNullable<S["Run"]["pause_state"]>;

// ----- opaque maps (index signatures survive Camelize untouched) -----

export type Metadata = S["Metadata"];
export type ScraperParams = S["ScraperParams"];

// ----- task/job models -----

export type TaskInput = Camelize<S["TaskInput"]>;
export type SubmitJobResponse = Camelize<S["SubmitJobResponse"]>;
export type AddTasksResponse = Camelize<S["AddTasksResponse"]>;
export type RerunJobResponse = Camelize<S["RerunJobResponse"]>;
export type Spend = Camelize<S["Spend"]>;
export type TaskSpend = Camelize<S["TaskSpend"]>;
export type RunStats = Camelize<S["RunStats"]>;
export type Run = Camelize<S["Run"]>;
export type Job = Camelize<S["Job"]>;
export type JobSchedule = Camelize<S["JobSchedule"]>;
export type ScheduleRate = Camelize<S["ScheduleRate"]>;
export type ScheduleCalendar = Camelize<S["ScheduleCalendar"]>;
export type ScheduleCadence = Camelize<S["ScheduleCadence"]>;
export type TaskResult = Camelize<S["TaskResult"]>;
export type TaskHistoryEvent = Camelize<S["TaskHistoryEvent"]>;
export type TaskHistoryResponse = Camelize<S["TaskHistoryResponse"]>;
export type WebhookConfig = Camelize<S["WebhookConfig"]>;
export type TestWebhookResponse = Camelize<S["TestWebhookResponse"]>;

// ----- list pages -----

export type ListJobsResponse = Camelize<S["ListJobsResponse"]>;
export type ListJobRunsResponse = Camelize<S["ListJobRunsResponse"]>;
export type ListResultsResponse = Camelize<S["ListResultsResponse"]>;

// ----- file inputs -----

export type FileInputColumnRef = S["FileInputColumnRef"];
export type FileInputUploadTarget = Camelize<S["FileInputUploadTarget"]>;
export type CreateJobInputRequest = Camelize<S["CreateJobInputRequest"]>;
export type CreateJobInputResponse = Camelize<S["CreateJobInputResponse"]>;

// ----- HMAC keys -----

export type HMACKeyMeta = Camelize<S["HMACKeyMeta"]>;
export type HMACKeyList = Camelize<S["HMACKeyList"]>;
export type HMACKeyCreated = Camelize<S["HMACKeyCreated"]>;
export type HMACKeyFinalized = Camelize<S["HMACKeyFinalized"]>;

// ----- exports -----

export type StartExportResponse = Camelize<S["StartExportResponse"]>;
export type Export = Camelize<S["Export"]>;

// ----- request bodies (camelCase input; status relaxed to optional) -----

/**
 * Body of `POST /jobs`. `status` is optional here (the server defaults
 * it to `closed`); the type-specific `submitRegular` / `submitOpen` /
 * `submitScheduled` shortcuts set it for you.
 */
export type SubmitJobRequest = Omit<Camelize<S["SubmitJobRequest"]>, "status"> & {
  status?: "open" | "closed";
};

/** Body of `POST /jobs/{id}/tasks`. `lastBatch` defaults to false. */
export type AddTasksRequest = Omit<Camelize<S["AddTasksRequest"]>, "lastBatch"> & {
  lastBatch?: boolean;
};

/** A URL to scrape: a bare string, or a task object with per-task fields. */
export type TaskInputLike = string | TaskInput;

/** Webhook config accepted at submit — `signature` optional (defaults false). */
export type WebhookInput = { url: string; signature?: boolean };
