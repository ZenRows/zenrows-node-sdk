import type { ZenRowsBatchClient } from "./client.js";
import type {
  DownloadToDirOptions,
  DownloadToMemoryOptions,
  DownloadedResult,
} from "./download.js";
import type { Schedule } from "./schedule.js";
import type {
  Export,
  ExportStatus,
  Job,
  JobStatus,
  Run,
  RunStats,
  RunStatus,
  StartExportResponse,
  SubmitJobResponse,
  TaskHistoryResponse,
  TaskResult,
  WebhookConfig,
} from "./types.js";

interface BatchTaskLike {
  url: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
  zenrows_params?: Record<string, unknown>;
}

// ======================= specific runs =======================

/** A reference to a specific run by `(jobId, runId)`. No pause/stop — only the CURRENT run supports those. */
export class RunRef {
  constructor(
    protected readonly client: ZenRowsBatchClient,
    readonly jobId: string,
    readonly runId: string,
  ) {}

  async load(): Promise<RunHandle> {
    return new RunHandle(
      this.client,
      this.jobId,
      this.runId,
      await this.client._getRunData(this.jobId, this.runId),
    );
  }

  async delete(): Promise<void> {
    await this.client._deleteRun(this.jobId, this.runId);
  }

  results(options: { status?: string } = {}): AsyncGenerator<TaskResult> {
    return this.client.iterResults(this.jobId, { runId: this.runId, status: options.status });
  }

  taskHistory(taskId: string): Promise<TaskHistoryResponse> {
    return this.client.getTaskHistory(this.jobId, taskId, { runId: this.runId });
  }

  downloadToDir(
    targetDir: string,
    options: DownloadToDirOptions & { status?: string } = {},
  ): Promise<number> {
    return this.client.downloadToDir(this.jobId, this.runId, targetDir, {
      status: "successful",
      ...options,
    });
  }

  downloadToMemory(
    options: DownloadToMemoryOptions & { status?: string } = {},
  ): Promise<DownloadedResult[]> {
    return this.client.downloadToMemory(this.jobId, this.runId, {
      status: "successful",
      ...options,
    });
  }

  downloadTaskToFile(task: TaskResult, target: string): Promise<void> {
    return this.client.downloadTaskToFile(task, target);
  }

  downloadTaskToMemory(task: TaskResult): Promise<Buffer> {
    return this.client.downloadTaskToMemory(task);
  }

  async wait(
    options: {
      targetStatuses?: Set<string>;
      failureStatuses?: Set<string>;
      timeout?: number;
      pollInterval?: number;
    } = {},
  ): Promise<RunHandle> {
    const run = await this.client.waitForRun(this.jobId, { ...options, runId: this.runId });
    return new RunHandle(this.client, this.jobId, this.runId, run);
  }

  startExport(): Promise<ExportRef> {
    return this.client.startResultsExport(this.jobId, this.runId);
  }

  export(exportId: string): ExportRef {
    return new ExportRef(this.client, this.jobId, this.runId, exportId);
  }

  downloadAllResults(
    targetPath: string,
    options: { waitTimeout?: number; pollInterval?: number } = {},
  ): Promise<string> {
    return this.client.downloadAllResults(this.jobId, this.runId, targetPath, options);
  }
}

export class RunHandle extends RunRef {
  constructor(
    client: ZenRowsBatchClient,
    jobId: string,
    runId: string,
    readonly data: Run,
  ) {
    super(client, jobId, runId);
  }

  get status(): RunStatus {
    return this.data.status;
  }

  get stats(): RunStats {
    return this.data.stats;
  }
}

// ============================ exports ============================

export class ExportRef {
  constructor(
    protected readonly client: ZenRowsBatchClient,
    readonly jobId: string,
    readonly runId: string,
    readonly exportId: string,
    readonly startResponse?: StartExportResponse,
  ) {}

  async load(): Promise<ExportHandle> {
    const data = await this.client._getExport(this.jobId, this.runId, this.exportId);
    return new ExportHandle(
      this.client,
      this.jobId,
      this.runId,
      this.exportId,
      data,
      this.startResponse,
    );
  }

  async wait(
    options: { targetStatuses?: Set<string>; timeout?: number; pollInterval?: number } = {},
  ): Promise<ExportHandle> {
    const data = await this.client.waitForExport(this.jobId, this.runId, this.exportId, options);
    return new ExportHandle(
      this.client,
      this.jobId,
      this.runId,
      this.exportId,
      data,
      this.startResponse,
    );
  }

  /** Stream the export zip to `targetPath`. The export must already be `completed`. */
  async downloadToPath(targetPath: string): Promise<string> {
    const handle = await this.load();
    if (handle.data.status !== "completed" || !handle.data.download_url) {
      throw new Error(handle.data.error ?? "export not completed");
    }
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const { createWriteStream } = await import("node:fs");
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    await mkdir(dirname(targetPath), { recursive: true });
    const response = await fetch(handle.data.download_url);
    if (!response.ok) {
      throw new Error(`export download failed with status ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
    return targetPath;
  }
}

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

  get status(): ExportStatus {
    return this.data.status;
  }
}

// ===================== current-run facet =====================

/** Operations on a job's CURRENT run, reached via `job.run`. */
export class CurrentRun {
  constructor(
    private readonly client: ZenRowsBatchClient,
    readonly jobId: string,
  ) {}

  private async currentRunId(): Promise<string> {
    const job = await this.client._getJobData(this.jobId);
    if (!job.latest_run) {
      throw new Error(`job ${this.jobId} has no run yet`);
    }
    return job.latest_run.run_id;
  }

  async load(): Promise<RunHandle> {
    const job = await this.client._getJobData(this.jobId);
    if (!job.latest_run) {
      throw new Error(`job ${this.jobId} has no run yet`);
    }
    return new RunHandle(this.client, this.jobId, job.latest_run.run_id, job.latest_run);
  }

  async pause(): Promise<RunHandle> {
    const run = await this.client._postPause(this.jobId);
    return new RunHandle(this.client, this.jobId, run.run_id, run);
  }

  async resume(): Promise<RunHandle> {
    const run = await this.client._postResume(this.jobId);
    return new RunHandle(this.client, this.jobId, run.run_id, run);
  }

  async stop(): Promise<RunHandle> {
    const run = await this.client._postStop(this.jobId);
    return new RunHandle(this.client, this.jobId, run.run_id, run);
  }

  cancel(): Promise<RunHandle> {
    return this.stop();
  }

  async wait(
    options: {
      targetStatuses?: Set<string>;
      failureStatuses?: Set<string>;
      timeout?: number;
      pollInterval?: number;
    } = {},
  ): Promise<RunHandle> {
    const run = await this.client.waitForRun(this.jobId, options);
    return new RunHandle(this.client, this.jobId, run.run_id, run);
  }

  results(options: { status?: string } = {}): AsyncGenerator<TaskResult> {
    return this.client.iterResults(this.jobId, { status: options.status });
  }

  taskHistory(taskId: string): Promise<TaskHistoryResponse> {
    return this.client.getTaskHistory(this.jobId, taskId);
  }

  downloadToDir(
    targetDir: string,
    options: DownloadToDirOptions & { status?: string } = {},
  ): Promise<number> {
    return this.client.downloadToDir(this.jobId, undefined, targetDir, {
      status: "successful",
      ...options,
    });
  }

  downloadToMemory(
    options: DownloadToMemoryOptions & { status?: string } = {},
  ): Promise<DownloadedResult[]> {
    return this.client.downloadToMemory(this.jobId, undefined, {
      status: "successful",
      ...options,
    });
  }

  downloadTaskToFile(task: TaskResult, target: string): Promise<void> {
    return this.client.downloadTaskToFile(task, target);
  }

  downloadTaskToMemory(task: TaskResult): Promise<Buffer> {
    return this.client.downloadTaskToMemory(task);
  }

  async startExport(): Promise<ExportRef> {
    return this.client.startResultsExport(this.jobId, await this.currentRunId());
  }

  async downloadAllResults(
    targetPath: string,
    options: { waitTimeout?: number; pollInterval?: number } = {},
  ): Promise<string> {
    return this.client.downloadAllResults(
      this.jobId,
      await this.currentRunId(),
      targetPath,
      options,
    );
  }
}

// ===================== schedule facet =====================

/** Operations on a scheduled job's schedule, reached via `job.schedule`. Scheduled jobs only — regular jobs 409. */
export class ScheduleControls {
  constructor(
    private readonly client: ZenRowsBatchClient,
    readonly jobId: string,
  ) {}

  async pause(): Promise<JobHandle> {
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client._postScheduleState(this.jobId, "paused"),
    );
  }

  async resume(): Promise<JobHandle> {
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client._postScheduleState(this.jobId, "active"),
    );
  }

  async update(schedule: Schedule): Promise<JobHandle> {
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client._putSchedule(this.jobId, schedule.toRequestBody()),
    );
  }
}

// ============================ jobs ============================

/** A reference to a job by id — job-template operations, plus `run`/`schedule` sub-facets. */
export class JobRef {
  private runFacet?: CurrentRun;
  private scheduleFacet?: ScheduleControls;

  constructor(
    protected readonly client: ZenRowsBatchClient,
    readonly jobId: string,
    readonly submitResponse?: SubmitJobResponse,
  ) {}

  /** Operations on the CURRENT run — pause/resume/stop/wait/results/downloads/startExport. */
  get run(): CurrentRun {
    if (!this.runFacet) this.runFacet = new CurrentRun(this.client, this.jobId);
    return this.runFacet;
  }

  /** Operations on the schedule — pause/resume/update (scheduled jobs only). */
  get schedule(): ScheduleControls {
    if (!this.scheduleFacet) this.scheduleFacet = new ScheduleControls(this.client, this.jobId);
    return this.scheduleFacet;
  }

  /** The job status from the submit response — only known on refs from a `submit*` call. */
  get status(): JobStatus | undefined {
    return this.submitResponse?.status;
  }

  get acceptedTasks(): number | undefined {
    return this.submitResponse?.accepted_tasks;
  }

  async load(): Promise<JobHandle> {
    return new JobHandle(this.client, this.jobId, await this.client._getJobData(this.jobId));
  }

  async close(): Promise<JobHandle> {
    return new JobHandle(this.client, this.jobId, await this.client._postClose(this.jobId));
  }

  async delete(): Promise<void> {
    await this.client._delete(this.jobId);
  }

  async rerun(
    options: { status?: string | string[]; idempotencyKey?: string } = {},
  ): Promise<RunHandle> {
    const resp = await this.client._postRerun(this.jobId, options);
    return new RunHandle(this.client, this.jobId, resp.latest_run.run_id, resp.latest_run);
  }

  /** Shortcut for `rerun({ status: "failed" })` (or `"failed,pending"` with `includePending`). */
  retryFailed(
    options: { includePending?: boolean; idempotencyKey?: string } = {},
  ): Promise<RunHandle> {
    const status = options.includePending ? ["failed", "pending"] : "failed";
    return this.rerun({ status, idempotencyKey: options.idempotencyKey });
  }

  addTasks(
    tasks: BatchTaskLike[],
    options: { lastBatch?: boolean } = {},
  ): Promise<{
    accepted_tasks: number;
    job_status: JobStatus;
    latest_run: Run;
  }> {
    return this.client._postTasks(this.jobId, tasks, options);
  }

  async *runs(pageSize?: number): AsyncGenerator<RunHandle> {
    yield* this.client.iterRuns(this.jobId, pageSize);
  }

  addFileInput(
    data: Uint8Array | string,
    options: {
      fields: { url: string | number; external_id?: string | number };
      header?: boolean;
      delimiter?: string;
      quote?: string;
    },
  ): Promise<string> {
    return this.client.uploadCsv(data, options);
  }

  getWebhook(): Promise<WebhookConfig> {
    return this.client.getJobWebhook(this.jobId);
  }

  setWebhook(url: string, signature: boolean): Promise<WebhookConfig> {
    return this.client.putJobWebhook(this.jobId, { url, signature });
  }

  async deleteWebhook(): Promise<void> {
    await this.client.deleteJobWebhook(this.jobId);
  }

  /** Block until the current run's async-carrier ingestion has finished writing task rows. */
  async waitForIngest(
    options: { timeout?: number; pollInterval?: number; maxPollInterval?: number } = {},
  ): Promise<JobHandle> {
    return new JobHandle(
      this.client,
      this.jobId,
      await this.client._waitForIngestRaw(this.jobId, options),
      this.submitResponse,
    );
  }
}

export class JobHandle extends JobRef {
  constructor(
    client: ZenRowsBatchClient,
    jobId: string,
    readonly data: Job,
    submitResponse?: SubmitJobResponse,
  ) {
    super(client, jobId, submitResponse);
  }

  get status(): JobStatus {
    return this.data.status;
  }
}
