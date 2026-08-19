import {
  type DownloadToDirOptions,
  type DownloadToMemoryOptions,
  type DownloadedResult,
  downloadTaskToFile,
  downloadTaskToMemory,
  downloadToDir,
  downloadToMemory,
} from "./download.js";
import { ZenRowsBatchError } from "./errors.js";
import { type CostEstimate, type ParamMap, type TaskLike, estimateCost } from "./estimate.js";
import {
  CurrentRun,
  ExportHandle,
  ExportRef,
  JobHandle,
  JobRef,
  RunHandle,
  RunRef,
} from "./resources.js";
import type { Schedule } from "./schedule.js";
import { BatchTransport } from "./transport.js";
import type {
  AddTasksResponse,
  CreateJobInputResponse,
  Export,
  HMACKeyCreated,
  HMACKeyFinalized,
  HMACKeyList,
  Job,
  JobSchedule,
  JobStatus,
  JobType,
  ListJobRunsResponse,
  ListJobsResponse,
  ListResultsResponse,
  RerunJobResponse,
  Run,
  StartExportResponse,
  TaskHistoryResponse,
  TaskResult,
  TestWebhookResponse,
  WebhookConfig,
} from "./types.js";
import { pollUntil } from "./waiters.js";

const DEFAULT_BATCH_API_URL = "https://async.api.zenrows.com/v1";

const TERMINAL_RUN_STATUSES = new Set(["completed", "stopped", "deleted"]);
const TERMINAL_EXPORT_STATUSES = new Set(["completed", "failed"]);

export interface BatchClientConfig {
  /** Override the Batch API base URL. Matches the Go/Python batch clients' base-URL override. */
  baseURL?: string;
  /** Retries for transient failures (429/502/503/504 + network errors) on idempotent requests. Default 3. */
  retries?: number;
}

export interface BatchTask {
  url: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
  zenrows_params?: Record<string, unknown>;
}

export interface BatchWebhookConfig {
  url: string;
  signature?: boolean;
}

export interface SubmitJobOptions {
  type?: JobType;
  status?: JobStatus;
  zenrows_params?: Record<string, unknown>;
  tasks?: BatchTask[];
  file_input_id?: string;
  external_id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  webhook?: BatchWebhookConfig;
  idempotencyKey?: string;
  /** Block until ingestion finishes for a large (202) submission — see `JobRef.waitForIngest`. */
  waitForIngest?: boolean;
}

export interface SubmitTypedOptions {
  zenrowsParams?: ParamMap;
  externalId?: string;
  name?: string;
  metadata?: Record<string, string>;
  webhook?: BatchWebhookConfig;
  idempotencyKey?: string;
  waitForIngest?: boolean;
}

export interface ListJobsOptions {
  status?: JobStatus;
  type?: JobType;
  limit?: number;
  cursor?: string;
}

export interface GetResultsOptions {
  runId?: string;
  cursor?: string;
  limit?: number;
  status?: string;
}

export interface WaitForRunOptions {
  runId?: string;
  targetStatuses?: Set<string>;
  failureStatuses?: Set<string>;
  timeout?: number;
  pollInterval?: number;
  maxPollInterval?: number;
}

type TaskInput = string | { url: string; external_id?: string; metadata?: Record<string, unknown> };

function coerceUrl(item: TaskInput): {
  url: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
} {
  return typeof item === "string" ? { url: item } : item;
}

/**
 * Client for the Zenrows Batch API (async, job/run/task model). Usable standalone
 * (`new ZenRowsBatchClient(apiKey)`, matching the Go and Python SDKs' batch clients) or via
 * the `client.batch` convenience property on a `ZenRows` instance.
 *
 * The **main pattern** is resource-style: `job(id)` / `submit*` return a `JobRef` (id-only,
 * no network); `getJob()` / `iterJobs()` return a loaded `JobHandle` with `.data`. Mutating
 * operations (`close`, `run.stop`, …) return a FRESH handle carrying the server's updated
 * state rather than mutating in place.
 */
export class ZenRowsBatchClient {
  readonly apiKey: string;
  private readonly transport: BatchTransport;

  constructor(apiKey: string, config: BatchClientConfig = {}) {
    this.apiKey = apiKey;
    this.transport = new BatchTransport(
      config.baseURL ?? DEFAULT_BATCH_API_URL,
      apiKey,
      config.retries,
    );
  }

  // ===== submit =====

  async submitJob(options: SubmitJobOptions = {}): Promise<JobRef> {
    const { idempotencyKey, waitForIngest, ...body } = options;
    const resp = await this.transport.requestJson<{
      job_id: string;
      status: JobStatus;
      latest_run?: Run;
      accepted_tasks: number;
      webhook?: WebhookConfig;
    }>("POST", "/jobs", { body, idempotencyKey });
    const ref = new JobRef(this, resp.job_id, resp);
    if (waitForIngest && resp.latest_run && resp.latest_run.ingest_status === "pending") {
      return ref.waitForIngest();
    }
    return ref;
  }

  /** Submit a one-shot scraping job (closed, all tasks known upfront). */
  async submitRegular(
    urls?: TaskInput[],
    fileInputId?: string,
    opts: SubmitTypedOptions = {},
  ): Promise<JobRef> {
    if (urls !== undefined && fileInputId !== undefined) {
      throw new Error("submitRegular: pass urls OR fileInputId, not both.");
    }
    if (urls === undefined && fileInputId === undefined) {
      throw new Error(
        "submitRegular: closed jobs require urls or fileInputId (use submitOpen for the open/extend pattern).",
      );
    }
    return this.submitJob({
      type: "regular",
      status: "closed",
      tasks: urls?.map(coerceUrl),
      file_input_id: fileInputId,
      zenrows_params: opts.zenrowsParams,
      external_id: opts.externalId,
      name: opts.name,
      metadata: opts.metadata,
      webhook: opts.webhook,
      idempotencyKey: opts.idempotencyKey,
      waitForIngest: opts.waitForIngest,
    });
  }

  /** Submit a streaming-style job that stays open for more tasks via `JobRef.addTasks`. */
  submitOpen(urls?: TaskInput[], opts: SubmitTypedOptions = {}): Promise<JobRef> {
    return this.submitJob({
      type: "regular",
      status: "open",
      tasks: urls?.map(coerceUrl),
      zenrows_params: opts.zenrowsParams,
      external_id: opts.externalId,
      name: opts.name,
      metadata: opts.metadata,
      webhook: opts.webhook,
      idempotencyKey: opts.idempotencyKey,
      waitForIngest: opts.waitForIngest,
    });
  }

  /** Submit a scheduled job. `schedule` is one of the `At`/`Rate`/`Calendar` builders. */
  async submitScheduled(
    schedule: Schedule,
    urls?: TaskInput[],
    fileInputId?: string,
    opts: SubmitTypedOptions = {},
  ): Promise<JobRef> {
    if (urls !== undefined && fileInputId !== undefined) {
      throw new Error("submitScheduled: pass urls OR fileInputId, not both.");
    }
    return this.submitJob({
      type: "scheduled",
      status: "closed",
      tasks: urls?.map(coerceUrl),
      file_input_id: fileInputId,
      zenrows_params: opts.zenrowsParams,
      external_id: opts.externalId,
      name: opts.name,
      metadata: opts.metadata,
      webhook: opts.webhook,
      idempotencyKey: opts.idempotencyKey,
      // biome-ignore lint/suspicious/noExplicitAny: schedule builder output matches JobSchedule at the wire boundary
      ...{ schedule: schedule.toRequestBody() as unknown as any },
    });
  }

  // ===== cost estimation (local, no API call) =====

  estimateCost(tasks: Iterable<TaskLike>, zenrowsParams?: ParamMap): CostEstimate {
    return estimateCost(tasks, zenrowsParams);
  }

  // ===== jobs =====

  /** A `JobRef` for an existing job with no network call — prefer this to act on a known id. */
  job(jobId: string): JobRef {
    return new JobRef(this, jobId);
  }

  async getJob(jobId: string): Promise<JobHandle> {
    return new JobHandle(this, jobId, await this._getJobData(jobId));
  }

  async listJobs(options: ListJobsOptions = {}): Promise<ListJobsResponse> {
    return this.transport.requestJson("GET", "/jobs", { query: options });
  }

  async *iterJobs(options: Omit<ListJobsOptions, "cursor"> = {}): AsyncGenerator<JobHandle> {
    let cursor: string | undefined;
    while (true) {
      const page = await this.listJobs({ ...options, cursor });
      for (const job of page.jobs) {
        yield new JobHandle(this, job.job_id, job);
      }
      cursor = page.next_cursor;
      if (!cursor) return;
    }
  }

  // ===== runs =====

  /** A `RunRef` for an existing run with no network call. */
  run(jobId: string, runId: string): RunRef {
    return new RunRef(this, jobId, runId);
  }

  async getRun(jobId: string, runId: string): Promise<RunHandle> {
    return new RunHandle(this, jobId, runId, await this._getRunData(jobId, runId));
  }

  async listRuns(
    jobId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<ListJobRunsResponse> {
    return this.transport.requestJson("GET", `/jobs/${jobId}/runs`, { query: options });
  }

  async *iterRuns(jobId: string, pageSize?: number): AsyncGenerator<RunHandle> {
    let cursor: string | undefined;
    while (true) {
      const page = await this.listRuns(jobId, { limit: pageSize, cursor });
      for (const run of page.runs) {
        yield new RunHandle(this, jobId, run.run_id, run);
      }
      cursor = page.next_cursor;
      if (!cursor) return;
    }
  }

  // ===== results / content =====

  async getResults(jobId: string, options: GetResultsOptions = {}): Promise<ListResultsResponse> {
    const { runId, ...query } = options;
    const path = runId ? `/jobs/${jobId}/runs/${runId}/results` : `/jobs/${jobId}/results`;
    return this.transport.requestJson("GET", path, { query });
  }

  async *iterResults(
    jobId: string,
    options: { runId?: string; status?: string } = {},
  ): AsyncGenerator<TaskResult> {
    let cursor: string | undefined;
    while (true) {
      const page = await this.getResults(jobId, { ...options, cursor });
      yield* page.results;
      cursor = page.next_cursor;
      if (!cursor) return;
    }
  }

  /** Returns the scraped page's raw content as-is (HTML/text, not JSON). */
  async getTaskContent(
    jobId: string,
    taskId: string,
    options: { runId?: string } = {},
  ): Promise<string> {
    const path = options.runId
      ? `/jobs/${jobId}/runs/${options.runId}/tasks/${taskId}/content`
      : `/jobs/${jobId}/tasks/${taskId}/content`;
    const response = await this.transport.requestRaw("GET", path);
    return response.text();
  }

  getTaskHistory(
    jobId: string,
    taskId: string,
    options: { runId?: string } = {},
  ): Promise<TaskHistoryResponse> {
    const path = options.runId
      ? `/jobs/${jobId}/runs/${options.runId}/tasks/${taskId}/history`
      : `/jobs/${jobId}/tasks/${taskId}/history`;
    return this.transport.requestJson("GET", path);
  }

  // ===== downloads =====

  downloadToDir(
    jobId: string,
    runId: string | undefined,
    targetDir: string,
    opts: DownloadToDirOptions = {},
  ) {
    return downloadToDir(
      this.iterResults(jobId, { runId, status: opts.status ?? "successful" }),
      targetDir,
      opts,
    );
  }

  downloadToMemory(
    jobId: string,
    runId: string | undefined,
    opts: DownloadToMemoryOptions & { status?: string } = {},
  ) {
    return downloadToMemory(
      this.iterResults(jobId, { runId, status: opts.status ?? "successful" }),
      opts,
    );
  }

  downloadTaskToFile(task: TaskResult, target: string): Promise<void> {
    return downloadTaskToFile(task, target);
  }

  downloadTaskToMemory(task: TaskResult): Promise<Buffer> {
    return downloadTaskToMemory(task);
  }

  // ===== webhooks =====

  getJobWebhook(jobId: string): Promise<WebhookConfig> {
    return this.transport.requestJson("GET", `/jobs/${jobId}/webhook`);
  }

  putJobWebhook(jobId: string, config: BatchWebhookConfig): Promise<WebhookConfig> {
    return this.transport.requestJson("PUT", `/jobs/${jobId}/webhook`, {
      body: { signature: false, ...config },
    });
  }

  async deleteJobWebhook(jobId: string): Promise<void> {
    await this.transport.requestJson("DELETE", `/jobs/${jobId}/webhook`);
  }

  testWebhook(config: BatchWebhookConfig): Promise<TestWebhookResponse> {
    return this.transport.requestJson("POST", "/webhook/test", {
      body: { signature: false, ...config },
    });
  }

  // ===== HMAC key lifecycle =====

  listHmacKeys(): Promise<HMACKeyList> {
    return this.transport.requestJson("GET", "/hmac/keys");
  }

  /** Capture the returned `secret` HERE — it is not revealed again. */
  rotateHmacKey(): Promise<HMACKeyCreated> {
    return this.transport.requestJson("POST", "/hmac/keys/rotate");
  }

  finalizeHmacKey(): Promise<HMACKeyFinalized> {
    return this.transport.requestJson("POST", "/hmac/keys/rotate/finalize");
  }

  async cancelHmacRotation(): Promise<void> {
    await this.transport.requestJson("DELETE", "/hmac/keys/rotate");
  }

  // ===== file inputs (CSV uploads) =====

  createJobInput(body: {
    type: "csv";
    csv: {
      delimiter?: string;
      quote?: string;
      header?: boolean;
      fields: { url: string | number; external_id?: string | number };
    };
  }): Promise<CreateJobInputResponse> {
    return this.transport.requestJson("POST", "/job_inputs", { body });
  }

  /** Allocate a CSV slot + PUT the body. Returns the `file_input_id` to pass to `submitJob`. */
  async uploadCsv(
    data: Uint8Array | string,
    options: {
      fields: { url: string | number; external_id?: string | number };
      header?: boolean;
      delimiter?: string;
      quote?: string;
    },
  ): Promise<string> {
    const created = await this.createJobInput({
      type: "csv",
      csv: {
        delimiter: options.delimiter ?? ",",
        quote: options.quote ?? '"',
        header: options.header ?? false,
        fields: options.fields,
      },
    });
    const headers = { "Content-Type": "text/csv", ...(created.upload.headers ?? {}) };
    // The presigned URL lives on a different host (S3) — a bare fetch so our API key never
    // reaches it, matching the Python SDK's explicit design choice.
    const response = await fetch(created.upload.url, {
      method: created.upload.method,
      headers,
      body: data,
    });
    if (!response.ok) {
      throw new ZenRowsBatchError(response.status, undefined);
    }
    return created.file_input_id;
  }

  // ===== results exports =====

  async startResultsExport(jobId: string, runId: string): Promise<ExportRef> {
    const resp = await this._postExportStart(jobId, runId);
    return new ExportRef(this, jobId, runId, resp.export_id, resp);
  }

  async getResultsExport(jobId: string, runId: string, exportId: string): Promise<ExportHandle> {
    return new ExportHandle(
      this,
      jobId,
      runId,
      exportId,
      await this._getExport(jobId, runId, exportId),
    );
  }

  async waitForExport(
    jobId: string,
    runId: string,
    exportId: string,
    options: {
      targetStatuses?: Set<string>;
      timeout?: number;
      pollInterval?: number;
      maxPollInterval?: number;
    } = {},
  ): Promise<Export> {
    const target = options.targetStatuses ?? TERMINAL_EXPORT_STATUSES;
    return pollUntil(() => this._getExport(jobId, runId, exportId), {
      isDone: (e) => target.has(e.status),
      timeout: options.timeout ?? 600,
      initialInterval: options.pollInterval ?? 2,
      maxInterval: options.maxPollInterval ?? 15,
    });
  }

  /** Start an export, wait for it, and save the zip to `targetPath`. Capped at 1 GiB per run. */
  async downloadAllResults(
    jobId: string,
    runId: string,
    targetPath: string,
    options: { waitTimeout?: number; pollInterval?: number } = {},
  ): Promise<string> {
    const exportRef = await this.startResultsExport(jobId, runId);
    const final = await this.waitForExport(jobId, runId, exportRef.exportId, {
      timeout: options.waitTimeout ?? 600,
      pollInterval: options.pollInterval ?? 2,
    });
    if (final.status !== "completed" || !final.download_url) {
      throw new Error(final.error ?? "export completed but server returned no download_url");
    }
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const { createWriteStream } = await import("node:fs");
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    await mkdir(dirname(targetPath), { recursive: true });
    const response = await fetch(final.download_url);
    if (!response.ok) {
      throw new ZenRowsBatchError(response.status, undefined);
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
    return targetPath;
  }

  // ===== waiter =====

  async waitForRun(jobId: string, options: WaitForRunOptions = {}): Promise<Run> {
    return this._waitForRunRaw(jobId, options);
  }

  // ==========================================================
  // "raw" methods — no resource wrapping; used by handles internally.
  // ==========================================================

  /** @internal */
  async _getJobData(jobId: string): Promise<Job> {
    return this.transport.requestJson("GET", `/jobs/${jobId}`);
  }

  /** @internal */
  async _getRunData(jobId: string, runId: string): Promise<Run> {
    return this.transport.requestJson("GET", `/jobs/${jobId}/runs/${runId}`);
  }

  /** @internal */
  async _postClose(jobId: string): Promise<Job> {
    return this.transport.requestJson("POST", `/jobs/${jobId}/close`);
  }

  /** @internal */
  async _postStop(jobId: string): Promise<Run> {
    return this.transport.requestJson("POST", `/jobs/${jobId}/stop`);
  }

  /** @internal */
  async _postPause(jobId: string): Promise<Run> {
    return this.transport.requestJson("POST", `/jobs/${jobId}/pause`);
  }

  /** @internal */
  async _postResume(jobId: string): Promise<Run> {
    return this.transport.requestJson("POST", `/jobs/${jobId}/resume`);
  }

  /** @internal */
  async _delete(jobId: string): Promise<void> {
    await this.transport.requestJson("DELETE", `/jobs/${jobId}`);
  }

  /** @internal */
  async _deleteRun(jobId: string, runId: string): Promise<void> {
    await this.transport.requestJson("DELETE", `/jobs/${jobId}/runs/${runId}`);
  }

  /** @internal */
  async _postRerun(
    jobId: string,
    options: { status?: string | string[]; idempotencyKey?: string } = {},
  ): Promise<RerunJobResponse> {
    const status = Array.isArray(options.status) ? options.status.join(",") : options.status;
    return this.transport.requestJson("POST", `/jobs/${jobId}/rerun`, {
      query: status ? { status } : undefined,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** @internal */
  async _putSchedule(jobId: string, schedule: JobSchedule): Promise<Job> {
    return this.transport.requestJson("PUT", `/jobs/${jobId}/schedule`, { body: schedule });
  }

  /** @internal */
  async _postScheduleState(jobId: string, state: "paused" | "active"): Promise<Job> {
    return this.transport.requestJson("POST", `/jobs/${jobId}/schedule/state`, {
      body: { schedule_state: state },
    });
  }

  /** @internal */
  async _postTasks(
    jobId: string,
    tasks: BatchTask[],
    options: { lastBatch?: boolean } = {},
  ): Promise<AddTasksResponse> {
    return this.transport.requestJson("POST", `/jobs/${jobId}/tasks`, {
      body: { tasks, last_batch: options.lastBatch ?? false },
    });
  }

  /** @internal */
  async _postExportStart(jobId: string, runId: string): Promise<StartExportResponse> {
    return this.transport.requestJson("POST", `/jobs/${jobId}/runs/${runId}/exports`);
  }

  /** @internal */
  async _getExport(jobId: string, runId: string, exportId: string): Promise<Export> {
    return this.transport.requestJson("GET", `/jobs/${jobId}/runs/${runId}/exports/${exportId}`);
  }

  /** @internal */
  async _waitForRunRaw(jobId: string, options: WaitForRunOptions): Promise<Run> {
    const target = options.targetStatuses ?? TERMINAL_RUN_STATUSES;
    const fetchRun = async (): Promise<Run | undefined> => {
      if (!options.runId) {
        const job = await this._getJobData(jobId);
        return job.latest_run;
      }
      return this._getRunData(jobId, options.runId);
    };
    return pollUntil(fetchRun, {
      isDone: (run) => run !== undefined && target.has(run.status),
      isFailure: (run) => run !== undefined && Boolean(options.failureStatuses?.has(run.status)),
      timeout: options.timeout ?? 300,
      initialInterval: options.pollInterval ?? 2,
      maxInterval: options.maxPollInterval ?? 15,
      // biome-ignore lint/suspicious/noExplicitAny: fetchRun can resolve undefined for a not-yet-fired scheduled job
    }) as Promise<any>;
  }

  /** @internal */
  async _waitForIngestRaw(
    jobId: string,
    options: { timeout?: number; pollInterval?: number; maxPollInterval?: number } = {},
  ): Promise<Job> {
    return pollUntil(() => this._getJobData(jobId), {
      isDone: (job) => {
        const run = job.latest_run;
        if (!run || TERMINAL_RUN_STATUSES.has(run.status)) return true;
        return run.ingest_status !== "pending";
      },
      timeout: options.timeout ?? 300,
      initialInterval: options.pollInterval ?? 2,
      maxInterval: options.maxPollInterval ?? 15,
    });
  }
}

export { CurrentRun, ExportHandle, ExportRef, JobHandle, JobRef, RunHandle, RunRef };
export type { DownloadedResult };
