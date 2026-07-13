/**
 * Resource handles for the Batch SDK — a two-tier (typestate) design
 * with namespaced sub-facets.
 *
 * For each resource there's a *reference* and a *loaded handle*:
 *
 *   - `JobRef` wraps `(client, jobId)` and exposes every job-template
 *     operation that needs **only the id** — `close`, `delete`,
 *     `rerun`/`retryFailed`, `addTasks`, `runs()`, webhooks. It holds
 *     no snapshot; `await ref.load()` fetches and returns a…
 *   - `JobHandle` — a `JobRef` plus a guaranteed, synchronous
 *     `readonly data: Job`. Returned by `getJob` / `iterJobs` / the
 *     ops that echo fresh state.
 *
 * Two sub-facets hang off every job (ref or handle), because the API
 * has two distinct scopes that both use the word "pause":
 *
 *   - `job.run.*`      — operations on the **current run**: `pause` /
 *     `resume` (run-level suspend), `stop` / `cancel`, `wait`,
 *     `results`, `taskContent`, downloads, `startExport`.
 *   - `job.schedule.*` — operations on the **schedule**: `pause` /
 *     `resume` (skip future fires) and `update`.
 *
 * Address a *specific historical* run with `client.run(jobId, runId)`
 * (a `RunRef`); it deliberately has no `pause`/`stop`, since the API
 * only pauses or stops the current run.
 *
 * Handles are immutable snapshots: mutating ops return a *new* loaded
 * handle with the server's fresh state rather than updating in place.
 */

import type { ZenRowsBatchClient } from "./client.js";
import {
  type DownloadTaskToDirOptions,
  type DownloadToDirOptions,
  type DownloadToMemoryOptions,
  type DownloadedResult,
  downloadTaskToDir,
  downloadTaskToMemory,
  downloadToDir,
  downloadToMemory,
} from "./download.js";
import { BatchApiError } from "./errors.js";
import type { ScheduleInput } from "./schedule.js";
import type { AsyncStream } from "./stream.js";
import type {
  AddTasksRequest,
  AddTasksResponse,
  Export,
  FileInputColumnRef,
  Job,
  Run,
  StartExportResponse,
  SubmitJobResponse,
  TaskHistoryResponse,
  TaskResult,
} from "./types.js";

type HandleDownloadToDirOptions = Omit<DownloadToDirOptions, "runId">;
type HandleDownloadToMemoryOptions = Omit<DownloadToMemoryOptions, "runId">;

export interface WaitOptions {
  targetStatuses?: ReadonlySet<string>;
  failureStatuses?: ReadonlySet<string>;
  timeout?: number;
  pollInterval?: number;
  onProgress?: (run: Run | undefined) => void;
}

export interface RerunOptions {
  status?: string | string[];
  idempotencyKey?: string;
}

export interface DownloadAllOptions {
  waitTimeout?: number;
  pollInterval?: number;
}

// ======================= specific runs =======================

/**
 * A reference to a **specific** run by `(jobId, runId)` — read/download
 * operations on one (usually historical) run. No `pause`/`stop`: the
 * API only suspends or stops the *current* run (see `job.run`).
 */
export class RunRef {
  constructor(
    protected readonly client: ZenRowsBatchClient,
    readonly jobId: string,
    readonly runId: string,
  ) {}

  /** `GET /jobs/{id}/runs/{runId}` — fetch the run and return a loaded handle. */
  async load(): Promise<RunHandle> {
    return new RunHandle(
      this.client,
      this.jobId,
      this.runId,
      await this.client.getRunData(this.jobId, this.runId),
    );
  }

  /** `DELETE /jobs/{id}/runs/{runId}` — scrub one run only. */
  async delete(): Promise<void> {
    await this.client.deleteRunData(this.jobId, this.runId);
  }

  results(options: { status?: string } = {}): AsyncStream<TaskResult> {
    return this.client.iterResults(this.jobId, { runId: this.runId, status: options.status });
  }

  taskContent(taskId: string): Promise<{ body: Uint8Array; contentType: string }> {
    return this.client.getTaskContentRaw(this.jobId, taskId, { runId: this.runId });
  }

  taskHistory(taskId: string): Promise<TaskHistoryResponse> {
    return this.client.getTaskHistoryRaw(this.jobId, taskId, { runId: this.runId });
  }

  downloadToDir(targetDir: string, options: HandleDownloadToDirOptions = {}): Promise<number> {
    return downloadToDir(this.client, this.jobId, targetDir, { ...options, runId: this.runId });
  }

  downloadToMemory(options: HandleDownloadToMemoryOptions = {}): Promise<DownloadedResult[]> {
    return downloadToMemory(this.client, this.jobId, { ...options, runId: this.runId });
  }

  /** Download one result's body into `targetDir` (one file); returns the path. */
  downloadTaskToDir(
    task: TaskResult,
    targetDir: string,
    options: Omit<DownloadTaskToDirOptions, "runId"> = {},
  ): Promise<string> {
    return downloadTaskToDir(this.client, this.jobId, task, targetDir, {
      ...options,
      runId: this.runId,
    });
  }

  /** Download one result's body into memory as a {@link DownloadedResult}. */
  downloadTaskToMemory(task: TaskResult): Promise<DownloadedResult> {
    return downloadTaskToMemory(this.client, this.jobId, task, { runId: this.runId });
  }

  /** Block until this run reaches a target state; returns the fresh loaded handle. */
  async wait(options: WaitOptions = {}): Promise<RunHandle> {
    const run = await this.client.waitForRunRaw(this.jobId, { ...options, runId: this.runId });
    return new RunHandle(this.client, this.jobId, this.runId, run);
  }

  /** `POST .../exports` — start an async zip of this run's bodies. */
  startExport(): Promise<ExportRef> {
    return this.client.startResultsExport(this.jobId, this.runId);
  }

  /** Address a specific export of this run by id (no network call). */
  export(exportId: string): ExportRef {
    return new ExportRef(this.client, this.jobId, this.runId, exportId);
  }

  /** Server-side zip export of this run's results → `targetPath`. */
  downloadAllResults(targetPath: string, options: DownloadAllOptions = {}): Promise<string> {
    return this.client.downloadAllResults(this.jobId, this.runId, targetPath, options);
  }
}

/** A {@link RunRef} plus a guaranteed, synchronous `data` snapshot. */
export class RunHandle extends RunRef {
  constructor(
    client: ZenRowsBatchClient,
    jobId: string,
    runId: string,
    readonly data: Run,
  ) {
    super(client, jobId, runId);
  }
}

// ============================ exports ============================

/** A reference to a results-export by id. Call `load()` / `wait()` for data. */
export class ExportRef {
  constructor(
    protected readonly client: ZenRowsBatchClient,
    readonly jobId: string,
    readonly runId: string,
    readonly exportId: string,
    /** The immediate start response, when this ref came from `startExport`. */
    readonly startResponse?: StartExportResponse,
  ) {}

  /** `GET .../exports/{id}` — fetch the export and return a loaded handle. */
  async load(): Promise<ExportHandle> {
    const data = await this.client.getExport(this.jobId, this.runId, this.exportId);
    return new ExportHandle(this.client, this.jobId, this.runId, this.exportId, data);
  }

  /** Block until the export reaches a terminal state; returns the loaded handle. */
  async wait(
    options: { targetStatuses?: ReadonlySet<string>; timeout?: number; pollInterval?: number } = {},
  ): Promise<ExportHandle> {
    const data = await this.client.waitForExport(this.jobId, this.runId, this.exportId, options);
    return new ExportHandle(this.client, this.jobId, this.runId, this.exportId, data);
  }

  /**
   * Stream the export zip to `targetPath`. Fetches once for a fresh
   * presigned URL; requires the export to be `completed`.
   */
  async downloadToPath(targetPath: string): Promise<string> {
    const { data } = await this.load();
    if (data.status !== "completed") {
      throw new BatchApiError(0, null, data.error ?? "export not completed");
    }
    if (!data.downloadUrl) {
      throw new BatchApiError(0, null, "export completed but server returned no downloadUrl");
    }
    return this.client.streamToPath(data.downloadUrl, targetPath);
  }
}

/** An {@link ExportRef} plus a guaranteed, synchronous `data` snapshot. */
export class ExportHandle extends ExportRef {
  constructor(
    client: ZenRowsBatchClient,
    jobId: string,
    runId: string,
    exportId: string,
    readonly data: Export,
    startResponse?: StartExportResponse,
  ) {
    super(client, jobId, runId, exportId, startResponse);
  }
}

// ===================== current-run facet =====================

/**
 * Operations on a job's **current run**, reached via `job.run`. The
 * pause/stop family only ever targets the latest run (the API's
 * run-less endpoints resolve it server-side), which is why they live
 * here and not on {@link RunRef}.
 */
export class CurrentRun {
  constructor(
    private readonly client: ZenRowsBatchClient,
    private readonly jobId: string,
  ) {}

  private async currentRunId(): Promise<string> {
    const job = await this.client.getJobData(this.jobId);
    if (!job.latestRun) throw new Error(`job ${this.jobId} has no run yet`);
    return job.latestRun.runId;
  }

  /** `GET /jobs/{id}` → the latest run as a loaded {@link RunHandle}. */
  async load(): Promise<RunHandle> {
    const job = await this.client.getJobData(this.jobId);
    if (!job.latestRun) throw new Error(`job ${this.jobId} has no run yet`);
    return new RunHandle(this.client, this.jobId, job.latestRun.runId, job.latestRun);
  }

  /**
   * `POST /jobs/{id}/pause` — reversibly suspend the current run: the
   * dispatcher stops pulling its queue (in-flight tasks may still
   * settle). Orthogonal to `status`; undo with `resume()`.
   */
  async pause(): Promise<RunHandle> {
    const run = await this.client.postPause(this.jobId);
    return new RunHandle(this.client, this.jobId, run.runId, run);
  }

  /** `POST /jobs/{id}/resume` — un-pause the current run. */
  async resume(): Promise<RunHandle> {
    const run = await this.client.postResume(this.jobId);
    return new RunHandle(this.client, this.jobId, run.runId, run);
  }

  /** `POST /jobs/{id}/stop` — terminally stop the current run. */
  async stop(): Promise<RunHandle> {
    const run = await this.client.postStop(this.jobId);
    return new RunHandle(this.client, this.jobId, run.runId, run);
  }

  /** Alias for {@link stop}. */
  cancel(): Promise<RunHandle> {
    return this.stop();
  }

  /** Block until the current run reaches a target state; returns its loaded handle. */
  async wait(options: WaitOptions = {}): Promise<RunHandle> {
    const run = await this.client.waitForRunRaw(this.jobId, options);
    return new RunHandle(this.client, this.jobId, run.runId, run);
  }

  /** Auto-paginate task results from the current run. */
  results(options: { status?: string } = {}): AsyncStream<TaskResult> {
    return this.client.iterResults(this.jobId, { status: options.status });
  }

  /** Current-run task body. Returns `{ body, contentType }`. */
  taskContent(taskId: string): Promise<{ body: Uint8Array; contentType: string }> {
    return this.client.getTaskContentRaw(this.jobId, taskId);
  }

  /** Current-run per-attempt event log for one task. */
  taskHistory(taskId: string): Promise<TaskHistoryResponse> {
    return this.client.getTaskHistoryRaw(this.jobId, taskId);
  }

  downloadToDir(targetDir: string, options: HandleDownloadToDirOptions = {}): Promise<number> {
    return downloadToDir(this.client, this.jobId, targetDir, options);
  }

  downloadToMemory(options: HandleDownloadToMemoryOptions = {}): Promise<DownloadedResult[]> {
    return downloadToMemory(this.client, this.jobId, options);
  }

  /** Download one result's body into `targetDir` (one file); returns the path. */
  downloadTaskToDir(
    task: TaskResult,
    targetDir: string,
    options: Omit<DownloadTaskToDirOptions, "runId"> = {},
  ): Promise<string> {
    return downloadTaskToDir(this.client, this.jobId, task, targetDir, options);
  }

  /** Download one result's body into memory as a {@link DownloadedResult}. */
  downloadTaskToMemory(task: TaskResult): Promise<DownloadedResult> {
    return downloadTaskToMemory(this.client, this.jobId, task);
  }

  /** `POST .../exports` — start an async zip of the current run's bodies. */
  async startExport(): Promise<ExportRef> {
    return this.client.startResultsExport(this.jobId, await this.currentRunId());
  }

  /** Server-side zip export of the current run's results → `targetPath`. */
  async downloadAllResults(targetPath: string, options: DownloadAllOptions = {}): Promise<string> {
    return this.client.downloadAllResults(
      this.jobId,
      await this.currentRunId(),
      targetPath,
      options,
    );
  }
}

// ===================== schedule facet =====================

/** Operations on a scheduled job's schedule, reached via `job.schedule`. */
export class ScheduleControls {
  constructor(
    private readonly client: ZenRowsBatchClient,
    private readonly jobId: string,
  ) {}

  /**
   * `POST /jobs/{id}/schedule/state` → `paused` — skip future scheduled
   * fires (an in-flight run keeps running). Undo with `resume()`.
   */
  async pause(): Promise<JobHandle> {
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client.postScheduleState(this.jobId, "paused"),
    );
  }

  /** `POST /jobs/{id}/schedule/state` → `active` — re-enable scheduled fires. */
  async resume(): Promise<JobHandle> {
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client.postScheduleState(this.jobId, "active"),
    );
  }

  /** `PUT /jobs/{id}/schedule` — replace the schedule ({@link ScheduleInput} object). */
  async update(schedule: ScheduleInput): Promise<JobHandle> {
    const resolved = this.client.resolveSchedule(schedule);
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client.putSchedule(this.jobId, resolved),
    );
  }
}

// ============================ jobs ============================

/**
 * A reference to a job by id — job-template operations, plus the
 * `run` and `schedule` sub-facets. Minted with **no network call** by
 * `client.job(id)` and returned by `submitJob` (with `submitResponse`
 * attached). Call `load()` for a {@link JobHandle} with data.
 */
export class JobRef {
  private runFacet?: CurrentRun;
  private scheduleFacet?: ScheduleControls;

  constructor(
    protected readonly client: ZenRowsBatchClient,
    readonly jobId: string,
    /** The immediate submit response, when this ref came from a submit. */
    readonly submitResponse?: SubmitJobResponse,
  ) {}

  /** Operations on the **current run** (`pause`/`resume`/`stop`/`wait`/`results`/…). */
  get run(): CurrentRun {
    if (!this.runFacet) this.runFacet = new CurrentRun(this.client, this.jobId);
    return this.runFacet;
  }

  /** Operations on the **schedule** (`pause`/`resume`/`update`) — scheduled jobs. */
  get schedule(): ScheduleControls {
    if (!this.scheduleFacet) this.scheduleFacet = new ScheduleControls(this.client, this.jobId);
    return this.scheduleFacet;
  }

  /** `GET /jobs/{id}` — fetch the full job and return a loaded handle. */
  async load(): Promise<JobHandle> {
    return new JobHandle(this.client, this.jobId, await this.client.getJobData(this.jobId));
  }

  // ----- lifecycle -----

  /** `POST /jobs/{id}/close` — lock the job. Returns the fresh loaded handle. */
  async close(): Promise<JobHandle> {
    return new JobHandle(this.client, this.jobId, await this.client.postClose(this.jobId));
  }

  /** `DELETE /jobs/{id}` — async hard delete. */
  async delete(): Promise<void> {
    await this.client.deleteJobData(this.jobId);
  }

  /**
   * `POST /jobs/{id}/rerun[?status=...]` — start a new run (full replay,
   * or partial retry of matching task statuses). Returns the new run's
   * loaded {@link RunHandle}.
   */
  async rerun(options: RerunOptions = {}): Promise<RunHandle> {
    const resp = await this.client.postRerun(this.jobId, options);
    return new RunHandle(this.client, this.jobId, resp.latestRun.runId, resp.latestRun);
  }

  /**
   * Re-execute only the previous run's **failed** tasks — successes are
   * inherited verbatim. `includePending` also re-enqueues never-started
   * tasks. Shortcut for `rerun({ status: "failed" })`.
   */
  retryFailed(
    options: { includePending?: boolean; idempotencyKey?: string } = {},
  ): Promise<RunHandle> {
    const status = options.includePending ? ["failed", "pending"] : "failed";
    return this.rerun({ status, idempotencyKey: options.idempotencyKey });
  }

  // ----- tasks (write path) -----

  /** `POST /jobs/{id}/tasks` — append to the open initial run. */
  addTasks(body: AddTasksRequest): Promise<AddTasksResponse> {
    return this.client.postTasks(this.jobId, body);
  }

  // ----- webhooks -----

  getWebhook() {
    return this.client.getJobWebhook(this.jobId);
  }

  setWebhook(config: { url: string; signature: boolean }) {
    return this.client.putJobWebhook(this.jobId, config);
  }

  deleteWebhook(): Promise<void> {
    return this.client.deleteJobWebhook(this.jobId);
  }

  // ----- runs (list) -----

  /** Auto-paginate runs of this job as a stream of loaded {@link RunHandle}s. */
  runs(options: { pageSize?: number } = {}): AsyncStream<RunHandle> {
    return this.client.iterRuns(this.jobId, options);
  }

  // ----- file inputs -----

  /** Upload a CSV this job would consume on a future submission. */
  addFileInput(
    source: string | Uint8Array,
    options: {
      fields: { url: FileInputColumnRef; externalId?: FileInputColumnRef };
      header?: boolean;
      delimiter?: string;
      quote?: string;
    },
  ): Promise<string> {
    return this.client.uploadCsv(source, options);
  }

  // ----- ingest waiter -----

  /**
   * Block until the current run's async-carrier ingestion finishes
   * (large 202 submissions stream task rows off the request path).
   * Returns the fresh loaded handle.
   */
  async waitForIngest(
    options: { timeout?: number; pollInterval?: number; maxPollInterval?: number } = {},
  ): Promise<JobHandle> {
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client.waitForIngestRaw(this.jobId, options),
    );
  }
}

/**
 * A {@link JobRef} plus a guaranteed, synchronous `data` snapshot.
 * Returned by `getJob`, `iterJobs`, and the ops that echo fresh state.
 */
export class JobHandle extends JobRef {
  constructor(
    client: ZenRowsBatchClient,
    jobId: string,
    readonly data: Job,
    submitResponse?: SubmitJobResponse,
  ) {
    super(client, jobId, submitResponse);
  }
}
