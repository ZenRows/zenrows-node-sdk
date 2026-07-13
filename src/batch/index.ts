/**
 * Public surface for the ZenRows Batch (async-job) API.
 *
 * What's where:
 *   - {@link ZenRowsBatchClient} — the friendly typed facade. One
 *     method per OpenAPI operation, returning camelCase models.
 *   - `types` — camelCase model types derived from the generated
 *     `schema.ts` (regenerate from `docs/openapi.yaml` via
 *     `pnpm generate`). Do NOT hand-edit field names.
 *   - {@link BatchApiError} — RFC 7807 mapping.
 *
 * Completion is surfaced via waiters (`job.wait()` / `run.wait()`) and
 * webhooks — poll or get notified; there's no callback to wire up.
 */

export {
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  TERMINAL_EXPORT_STATUSES,
  TERMINAL_RUN_STATUSES,
  ZenRowsBatchClient,
} from "./client.js";
export type {
  BatchClientOptions,
  SubmitFields,
  SubmitOpenParams,
  SubmitOptions,
  SubmitRegularParams,
  SubmitScheduledParams,
  SubmitSource,
  UploadCsvOptions,
  WaitForRunOptions,
} from "./client.js";

export {
  CurrentRun,
  ExportHandle,
  ExportRef,
  JobHandle,
  JobRef,
  RunHandle,
  RunRef,
  ScheduleControls,
} from "./resources.js";
export type { RerunOptions, WaitOptions } from "./resources.js";

export { AsyncStream } from "./stream.js";
export { BatchApiError, type ProblemDetail } from "./errors.js";
export { WaiterError, WaiterTimeout } from "./waiters.js";

export { CostEstimate, type CostLine, type TaskCost, type Tier } from "./estimate.js";

export type { DayOfWeek, Duration, ScheduleInput } from "./schedule.js";

// Downloads run through handles (`job.run.downloadToDir(…)` etc.); only the
// error and option/result types are part of the public surface.
export {
  DownloadLimitExceeded,
  type DownloadedResult,
  type DownloadToDirOptions,
  type DownloadToMemoryOptions,
} from "./download.js";

export type * from "./types.js";
