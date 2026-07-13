/**
 * ZenRowsBatchClient — the friendly, typed facade over the Batch API.
 *
 * The **main pattern** is resource-style. Methods return one of two
 * tiers (see `resources.ts`): a {@link JobRef} / {@link RunRef} —
 * id-only operations, no data — or a loaded {@link JobHandle} /
 * {@link RunHandle} whose `.data` snapshot is synchronous and
 * guaranteed. `client.job(id)` and `submitRegular` give you a ref;
 * `getJob` / `iterJobs` and `ref.load()` give you a loaded handle.
 *
 * ```ts
 * const job = await client.submitRegular(["https://a", "https://b"]);
 * const run = await job.wait();                 // loaded RunHandle
 * console.log(run.data.stats.successful);       // .data is ready
 * for await (const row of run.results({ status: "successful" })) {
 *   console.log(row.externalId, row.resultUrl);
 * }
 * ```
 *
 * Listing endpoints have both a raw page method (`listJobs`) and an
 * auto-paginating async generator that yields loaded handles
 * (`iterJobs`).
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import packageJson from "../../package.json" with { type: "json" };
import { BatchApiError } from "./errors.js";
import { type CostEstimate, estimateCost as computeEstimate } from "./estimate.js";
import { ExportHandle, ExportRef, JobHandle, JobRef, RunHandle, RunRef } from "./resources.js";
import { type ScheduleInput, resolveSchedule as resolveScheduleInput } from "./schedule.js";
import { AsyncStream } from "./stream.js";
import { Transport } from "./transport.js";
import type {
  AddTasksRequest,
  AddTasksResponse,
  CreateJobInputResponse,
  Export,
  FileInputColumnRef,
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
  ScraperParams,
  StartExportResponse,
  SubmitJobRequest,
  SubmitJobResponse,
  TaskHistoryResponse,
  TaskInputLike,
  TaskResult,
  TestWebhookResponse,
  WebhookConfig,
  WebhookInput,
} from "./types.js";
import { WaiterTimeout } from "./waiters.js";
import { pollUntil } from "./waiters.js";

/** Run states that mean "no further work will happen on this run". */
export const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "stopped",
  "deleted",
]);

/** Export states that don't transition again. */
export const TERMINAL_EXPORT_STATUSES: ReadonlySet<string> = new Set(["completed", "failed"]);

export const DEFAULT_BASE_URL = "https://async.api.zenrows.com/v1";
export const DEFAULT_USER_AGENT = `zenrows-batch-node/${packageJson.version}`;

export interface BatchClientOptions {
  /** Override the API base URL (advanced / testing). */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default 30000. */
  timeout?: number;
  /**
   * Max automatic retries for transient failures (429/502/503/504 and
   * network errors) on idempotent requests — GET/PUT/DELETE, plus POSTs
   * carrying an `idempotencyKey`. Jittered exponential backoff, honoring
   * `Retry-After`. Default 3; set 0 to disable.
   */
  retries?: number;
  userAgent?: string;
  /** Inject a `fetch` implementation (testing). */
  fetch?: typeof fetch;
}

export interface SubmitOptions {
  idempotencyKey?: string;
  /** Block until a large (202) submission finishes ingesting task rows. */
  waitForIngest?: boolean;
}

/** Fields common to every submit, independent of the task source. */
export interface SubmitFields {
  zenrowsParams?: ScraperParams;
  externalId?: string;
  name?: string;
  metadata?: Record<string, string>;
  webhook?: WebhookInput;
  idempotencyKey?: string;
  waitForIngest?: boolean;
}

/** The task source — exactly one of `urls` / `fileInputId` (compiler-enforced). */
export type SubmitSource =
  | { urls: TaskInputLike[]; fileInputId?: never }
  | { fileInputId: string; urls?: never };

/** Params for {@link ZenRowsBatchClient.submitRegular}. */
export type SubmitRegularParams = SubmitSource & SubmitFields;

/** Params for {@link ZenRowsBatchClient.submitOpen} — `urls` optional, no file input. */
export type SubmitOpenParams = { urls?: TaskInputLike[] } & SubmitFields;

/** Params for {@link ZenRowsBatchClient.submitScheduled}. */
export type SubmitScheduledParams = { schedule: ScheduleInput } & SubmitSource & SubmitFields;

export interface WaitForRunOptions {
  runId?: string;
  targetStatuses?: ReadonlySet<string>;
  failureStatuses?: ReadonlySet<string>;
  /** Seconds. Default 300. */
  timeout?: number;
  /** Seconds. Default 2. */
  pollInterval?: number;
  /** Seconds. Default 15. */
  maxPollInterval?: number;
  onProgress?: (run: Run | undefined) => void;
}

export interface UploadCsvOptions {
  fields: { url: FileInputColumnRef; externalId?: FileInputColumnRef };
  header?: boolean;
  delimiter?: string;
  quote?: string;
}

export class ZenRowsBatchClient {
  private readonly transport: Transport;

  constructor(apiKey: string, options: BatchClientOptions = {}) {
    if (!apiKey) throw new Error("ZenRowsBatchClient: apiKey is required.");
    const baseUrl = options.baseUrl ?? process.env.ZENROWS_BATCH_BASE_URL ?? DEFAULT_BASE_URL;
    this.transport = new Transport({
      baseUrl,
      apiKey,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      timeout: options.timeout ?? 30_000,
      retries: options.retries ?? 3,
      fetch: options.fetch,
    });
  }

  get baseUrl(): string {
    return this.transport.baseUrl;
  }

  // ===== jobs (resource-returning) =====

  /**
   * `POST /jobs` — submit a new scraping job. The general, low-level
   * path; most callers prefer `submitRegular` / `submitOpen` /
   * `submitScheduled`, which hide the `type`/`status` boilerplate.
   */
  async submitJob(body: SubmitJobRequest, options: SubmitOptions = {}): Promise<JobRef> {
    if (body.externalId !== undefined) validateExternalId(body.externalId, "externalId");
    validateTaskExternalIds(body.tasks);
    const headers = options.idempotencyKey
      ? { "Idempotency-Key": options.idempotencyKey }
      : undefined;
    const resp = await this.transport.requestJson<SubmitJobResponse>("POST", "/jobs", {
      body,
      headers,
    });
    const ref = new JobRef(this, resp.jobId, resp);
    if (options.waitForIngest && resp.latestRun?.ingestStatus === "pending") {
      await ref.waitForIngest();
    }
    return ref;
  }

  /**
   * Submit a one-shot scraping job (closed, all tasks upfront). Pass
   * exactly one task source — `{ urls }` or `{ fileInputId }` — plus
   * optional job fields:
   *
   * ```ts
   * client.submitRegular({ urls: ["https://a", "https://b"], zenrowsParams: {...} });
   * client.submitRegular({ fileInputId });
   * ```
   */
  async submitRegular(params: SubmitRegularParams): Promise<JobRef> {
    return this.submitJob(buildSubmitBody("regular", "closed", params), params);
  }

  /**
   * Submit a streaming-style job that stays open for more `addTasks`.
   * `urls` is optional (may be empty); no file input.
   */
  async submitOpen(params: SubmitOpenParams = {}): Promise<JobRef> {
    return this.submitJob(buildSubmitBody("regular", "open", params), params);
  }

  /**
   * Submit a scheduled job. `schedule` is a declarative
   * {@link ScheduleInput} (`{ every: "6h" }`, `{ at, tz }`,
   * `{ times, days, tz }`, …); pass a `{ urls }` or `{ fileInputId }`
   * source alongside it.
   */
  async submitScheduled(params: SubmitScheduledParams): Promise<JobRef> {
    const body = buildSubmitBody("scheduled", "closed", params);
    body.schedule = resolveScheduleInput(params.schedule);
    return this.submitJob(body, params);
  }

  /** `GET /jobs/{id}` — a loaded {@link JobHandle} (its `.data` is ready). */
  async getJob(jobId: string): Promise<JobHandle> {
    const data = await this.getJobData(jobId);
    return new JobHandle(this, jobId, data);
  }

  /**
   * A {@link JobRef} for an existing job with **no network call** —
   * every id-only operation, and `load()` when you want the data.
   */
  job(jobId: string): JobRef {
    return new JobRef(this, jobId);
  }

  /**
   * Estimate a job's credit cost, assuming every task succeeds once —
   * `{ min, max, breakdown }`. Accepts the same body as `submitJob`.
   * Done client-side with the SDK's rate card, so it costs no API call;
   * async purely to keep the client surface uniformly promise-based.
   */
  async estimateCost(job: SubmitJobRequest): Promise<CostEstimate> {
    return computeEstimate(job.tasks ?? [], { zenrowsParams: job.zenrowsParams });
  }

  /** `GET /jobs` — one raw page. Prefer {@link iterJobs}. */
  listJobs(
    options: { limit?: number; cursor?: string; jobType?: JobType; status?: JobStatus } = {},
  ): Promise<ListJobsResponse> {
    return this.transport.requestJson<ListJobsResponse>("GET", "/jobs", {
      params: {
        limit: options.limit,
        cursor: options.cursor,
        type: options.jobType,
        status: options.status,
      },
    });
  }

  /** Auto-paginate {@link listJobs} as a stream of loaded {@link JobHandle}s. */
  iterJobs(
    options: { jobType?: JobType; status?: JobStatus; pageSize?: number } = {},
  ): AsyncStream<JobHandle> {
    const self = this;
    return new AsyncStream(async function* () {
      for await (const job of scan<Job, ListJobsResponse>(
        (cursor) =>
          self.listJobs({
            limit: options.pageSize,
            cursor,
            jobType: options.jobType,
            status: options.status,
          }),
        (page) => page.jobs,
      )) {
        yield new JobHandle(self, job.jobId, job);
      }
    });
  }

  // ===== runs =====

  /** `GET /jobs/{id}/runs/{runId}` — a loaded {@link RunHandle}. */
  async getRun(jobId: string, runId: string): Promise<RunHandle> {
    const data = await this.getRunData(jobId, runId);
    return new RunHandle(this, jobId, runId, data);
  }

  /** A {@link RunRef} with **no network call** — id-only ops + `load()`. */
  run(jobId: string, runId: string): RunRef {
    return new RunRef(this, jobId, runId);
  }

  /** `GET /jobs/{id}/runs` — one raw page. Prefer {@link iterRuns}. */
  listRuns(
    jobId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<ListJobRunsResponse> {
    return this.transport.requestJson<ListJobRunsResponse>("GET", `/jobs/${jobId}/runs`, {
      params: { limit: options.limit, cursor: options.cursor },
    });
  }

  /** Auto-paginate runs of a job as a stream of loaded {@link RunHandle}s. */
  iterRuns(jobId: string, options: { pageSize?: number } = {}): AsyncStream<RunHandle> {
    const self = this;
    return new AsyncStream(async function* () {
      for await (const run of self.iterRunsRaw(jobId, options.pageSize)) {
        yield new RunHandle(self, jobId, run.runId, run);
      }
    });
  }

  // ===== results / content =====

  /** `GET .../results` — one raw page. Prefer {@link iterResults}. */
  listResults(
    jobId: string,
    options: { runId?: string; status?: string; cursor?: string } = {},
  ): Promise<ListResultsResponse> {
    const path = options.runId
      ? `/jobs/${jobId}/runs/${options.runId}/results`
      : `/jobs/${jobId}/results`;
    return this.transport.requestJson<ListResultsResponse>("GET", path, {
      params: { status: options.status, cursor: options.cursor },
    });
  }

  /** Auto-paginate results as a stream of {@link TaskResult} rows. */
  iterResults(
    jobId: string,
    options: { runId?: string; status?: string } = {},
  ): AsyncStream<TaskResult> {
    return new AsyncStream(() => this.iterResultsRaw(jobId, options));
  }

  // ===== waiter =====

  /** Block until a run reaches one of `targetStatuses`. */
  waitForRun(jobId: string, options: WaitForRunOptions = {}): Promise<Run> {
    return this.waitForRunRaw(jobId, options);
  }

  // ===== file inputs (CSV uploads) =====

  /** `POST /job_inputs` — allocate a CSV slot. Prefer {@link uploadCsv}. */
  createJobInput(body: {
    type: "csv";
    csv?: {
      delimiter: string;
      quote: string;
      header: boolean;
      fields: { url: FileInputColumnRef; externalId?: FileInputColumnRef };
    };
  }): Promise<CreateJobInputResponse> {
    return this.transport.requestJson<CreateJobInputResponse>("POST", "/job_inputs", { body });
  }

  /**
   * Allocate a CSV slot, PUT the body to the presigned URL, and return
   * the `fileInputId` to pass to a submit call — one call instead of
   * three. `source` is a file path or the CSV bytes.
   */
  async uploadCsv(source: string | Uint8Array, options: UploadCsvOptions): Promise<string> {
    const created = await this.createJobInput({
      type: "csv",
      csv: {
        delimiter: options.delimiter ?? ",",
        quote: options.quote ?? '"',
        header: options.header ?? false,
        fields: options.fields,
      },
    });
    const headers = { ...(created.upload.headers ?? {}) };
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
      headers["Content-Type"] = "text/csv";
    }
    const data = typeof source === "string" ? await readFile(source) : source;
    // The presigned URL lives on a different host — use a bare fetch so
    // our auth header doesn't leak there.
    const response = await fetch(created.upload.url, {
      method: created.upload.method,
      headers,
      body: data,
    });
    if (response.status >= 400) {
      throw new BatchApiError(response.status, null, await response.text());
    }
    return created.fileInputId;
  }

  // ===== HMAC key lifecycle =====

  listHmacKeys(): Promise<HMACKeyList> {
    return this.transport.requestJson<HMACKeyList>("GET", "/hmac/keys");
  }

  /** Capture the returned `secret` — it is never revealed again. */
  rotateHmacKey(): Promise<HMACKeyCreated> {
    return this.transport.requestJson<HMACKeyCreated>("POST", "/hmac/keys/rotate");
  }

  finalizeHmacKey(): Promise<HMACKeyFinalized> {
    return this.transport.requestJson<HMACKeyFinalized>("POST", "/hmac/keys/rotate/finalize");
  }

  async cancelHmacRotation(): Promise<void> {
    await this.transport.requestJson<null>("DELETE", "/hmac/keys/rotate");
  }

  // ===== webhooks =====

  getJobWebhook(jobId: string): Promise<WebhookConfig> {
    return this.transport.requestJson<WebhookConfig>("GET", `/jobs/${jobId}/webhook`);
  }

  putJobWebhook(jobId: string, config: WebhookConfig): Promise<WebhookConfig> {
    return this.transport.requestJson<WebhookConfig>("PUT", `/jobs/${jobId}/webhook`, {
      body: config,
    });
  }

  async deleteJobWebhook(jobId: string): Promise<void> {
    await this.transport.requestJson<null>("DELETE", `/jobs/${jobId}/webhook`);
  }

  /** `POST /webhook/test` — dispatch a synthetic event to a receiver. */
  testWebhook(config: WebhookInput): Promise<TestWebhookResponse> {
    return this.transport.requestJson<TestWebhookResponse>("POST", "/webhook/test", {
      body: { signature: false, ...config },
    });
  }

  // ===== results exports =====

  /** `POST .../exports` — start an async zip of a run's task bodies. Returns an {@link ExportRef}. */
  async startResultsExport(jobId: string, runId: string): Promise<ExportRef> {
    const resp = await this.postExportStart(jobId, runId);
    return new ExportRef(this, jobId, runId, resp.exportId, resp);
  }

  async getResultsExport(jobId: string, runId: string, exportId: string): Promise<ExportHandle> {
    const data = await this.getExport(jobId, runId, exportId);
    return new ExportHandle(this, jobId, runId, exportId, data);
  }

  /** Block until an export reaches a terminal state. */
  waitForExport(
    jobId: string,
    runId: string,
    exportId: string,
    options: {
      targetStatuses?: ReadonlySet<string>;
      timeout?: number;
      pollInterval?: number;
      maxPollInterval?: number;
    } = {},
  ): Promise<Export> {
    return this.waitForExportRaw(jobId, runId, exportId, options);
  }

  /**
   * Start an export, wait for it, and save the zip to `targetPath`.
   * Capped at 1 GiB per run server-side; for larger runs use
   * `downloadToDir` (no size limit, but slower).
   */
  async downloadAllResults(
    jobId: string,
    runId: string,
    targetPath: string,
    options: { waitTimeout?: number; pollInterval?: number } = {},
  ): Promise<string> {
    const started = await this.startResultsExport(jobId, runId);
    const final = await this.waitForExport(jobId, runId, started.exportId, {
      timeout: options.waitTimeout ?? 600,
      pollInterval: options.pollInterval ?? 2,
    });
    if (final.status !== "completed") {
      throw new BatchApiError(0, null, final.error ?? "export failed");
    }
    if (!final.downloadUrl) {
      throw new BatchApiError(0, null, "export completed but server returned no downloadUrl");
    }
    await streamToFile(final.downloadUrl, targetPath);
    return targetPath;
  }

  /**
   * Stream a presigned URL to disk. Used by {@link ExportHandle} to
   * fetch an already-completed export's zip.
   * @internal
   */
  async streamToPath(url: string, targetPath: string): Promise<string> {
    await streamToFile(url, targetPath);
    return targetPath;
  }

  // ==========================================================
  // ===== "raw" methods used by handles + escape hatches =====
  // ==========================================================

  /** @internal */
  getJobData(jobId: string): Promise<Job> {
    return this.transport.requestJson<Job>("GET", `/jobs/${jobId}`);
  }

  /** @internal */
  getRunData(jobId: string, runId: string): Promise<Run> {
    return this.transport.requestJson<Run>("GET", `/jobs/${jobId}/runs/${runId}`);
  }

  /** @internal */
  postClose(jobId: string): Promise<Job> {
    return this.transport.requestJson<Job>("POST", `/jobs/${jobId}/close`);
  }

  /** @internal */
  postStop(jobId: string): Promise<Run> {
    return this.transport.requestJson<Run>("POST", `/jobs/${jobId}/stop`);
  }

  /** @internal — run-level pause (`latest_run.pause_state = paused`). */
  postPause(jobId: string): Promise<Run> {
    return this.transport.requestJson<Run>("POST", `/jobs/${jobId}/pause`);
  }

  /** @internal — run-level resume. */
  postResume(jobId: string): Promise<Run> {
    return this.transport.requestJson<Run>("POST", `/jobs/${jobId}/resume`);
  }

  /** @internal */
  async deleteJobData(jobId: string): Promise<void> {
    await this.transport.requestJson<null>("DELETE", `/jobs/${jobId}`);
  }

  /** @internal */
  async deleteRunData(jobId: string, runId: string): Promise<void> {
    await this.transport.requestJson<null>("DELETE", `/jobs/${jobId}/runs/${runId}`);
  }

  /** @internal */
  postRerun(
    jobId: string,
    options: { status?: string | string[]; idempotencyKey?: string } = {},
  ): Promise<RerunJobResponse> {
    const headers = options.idempotencyKey
      ? { "Idempotency-Key": options.idempotencyKey }
      : undefined;
    const status = Array.isArray(options.status) ? options.status.join(",") : options.status;
    return this.transport.requestJson<RerunJobResponse>("POST", `/jobs/${jobId}/rerun`, {
      params: status !== undefined ? { status } : undefined,
      headers,
    });
  }

  /** @internal */
  resolveSchedule(schedule: ScheduleInput): JobSchedule {
    return resolveScheduleInput(schedule);
  }

  /** @internal */
  putSchedule(jobId: string, schedule: JobSchedule): Promise<Job> {
    return this.transport.requestJson<Job>("PUT", `/jobs/${jobId}/schedule`, { body: schedule });
  }

  /** @internal */
  postScheduleState(jobId: string, state: "active" | "paused"): Promise<Job> {
    return this.transport.requestJson<Job>("POST", `/jobs/${jobId}/schedule/state`, {
      body: { scheduleState: state },
    });
  }

  /** @internal */
  async postTasks(jobId: string, body: AddTasksRequest): Promise<AddTasksResponse> {
    validateTaskExternalIds(body.tasks);
    return this.transport.requestJson<AddTasksResponse>("POST", `/jobs/${jobId}/tasks`, { body });
  }

  /** @internal */
  async *iterRunsRaw(jobId: string, pageSize?: number): AsyncGenerator<Run> {
    yield* scan<Run, ListJobRunsResponse>(
      (cursor) => this.listRuns(jobId, { limit: pageSize, cursor }),
      (page) => page.runs,
    );
  }

  /** @internal */
  async *iterResultsRaw(
    jobId: string,
    options: { runId?: string; status?: string } = {},
  ): AsyncGenerator<TaskResult> {
    yield* scan<TaskResult, ListResultsResponse>(
      (cursor) => this.listResults(jobId, { runId: options.runId, status: options.status, cursor }),
      (page) => page.results,
    );
  }

  /** @internal */
  getTaskContentRaw(
    jobId: string,
    taskId: string,
    options: { runId?: string } = {},
  ): Promise<{ body: Uint8Array; contentType: string }> {
    const path = options.runId
      ? `/jobs/${jobId}/runs/${options.runId}/tasks/${taskId}/content`
      : `/jobs/${jobId}/tasks/${taskId}/content`;
    return this.transport.requestBytes("GET", path);
  }

  /** @internal */
  getTaskHistoryRaw(
    jobId: string,
    taskId: string,
    options: { runId?: string } = {},
  ): Promise<TaskHistoryResponse> {
    const path = options.runId
      ? `/jobs/${jobId}/runs/${options.runId}/tasks/${taskId}/history`
      : `/jobs/${jobId}/tasks/${taskId}/history`;
    return this.transport.requestJson<TaskHistoryResponse>("GET", path);
  }

  /** @internal */
  postExportStart(jobId: string, runId: string): Promise<StartExportResponse> {
    return this.transport.requestJson<StartExportResponse>(
      "POST",
      `/jobs/${jobId}/runs/${runId}/exports`,
    );
  }

  /** @internal */
  getExport(jobId: string, runId: string, exportId: string): Promise<Export> {
    return this.transport.requestJson<Export>(
      "GET",
      `/jobs/${jobId}/runs/${runId}/exports/${exportId}`,
    );
  }

  /** @internal */
  private waitForExportRaw(
    jobId: string,
    runId: string,
    exportId: string,
    options: {
      targetStatuses?: ReadonlySet<string>;
      timeout?: number;
      pollInterval?: number;
      maxPollInterval?: number;
    },
  ): Promise<Export> {
    const target = options.targetStatuses ?? TERMINAL_EXPORT_STATUSES;
    return pollUntil<Export>({
      fetch: () => this.getExport(jobId, runId, exportId),
      isDone: (e) => target.has(e.status),
      timeout: options.timeout ?? 600,
      initialInterval: options.pollInterval ?? 2,
      maxInterval: options.maxPollInterval ?? 15,
    });
  }

  /** @internal */
  async waitForRunRaw(jobId: string, options: WaitForRunOptions): Promise<Run> {
    const target = options.targetStatuses ?? TERMINAL_RUN_STATUSES;
    const failure = options.failureStatuses;
    const runId = options.runId;
    const fetchRun = async (): Promise<Run | undefined> => {
      if (!runId) {
        const job = await this.getJobData(jobId);
        return job.latestRun;
      }
      return this.getRunData(jobId, runId);
    };
    return pollUntil<Run | undefined>({
      fetch: fetchRun,
      isDone: (run) => run !== undefined && target.has(run.status),
      isFailure: failure ? (run) => run !== undefined && failure.has(run.status) : undefined,
      onPoll: options.onProgress,
      timeout: options.timeout ?? 300,
      initialInterval: options.pollInterval ?? 2,
      maxInterval: options.maxPollInterval ?? 15,
    }) as Promise<Run>;
  }

  /** @internal */
  waitForIngestRaw(
    jobId: string,
    options: { timeout?: number; pollInterval?: number; maxPollInterval?: number } = {},
  ): Promise<Job> {
    return pollUntil<Job>({
      fetch: () => this.getJobData(jobId),
      isDone: (job) => {
        const run = job.latestRun;
        if (run === undefined || TERMINAL_RUN_STATUSES.has(run.status)) return true;
        return run.ingestStatus !== "pending";
      },
      timeout: options.timeout ?? 300,
      initialInterval: options.pollInterval ?? 2,
      maxInterval: options.maxPollInterval ?? 15,
    });
  }
}

// ----- helpers -----

async function* scan<Item, Page extends { nextCursor?: string | null }>(
  fetchPage: (cursor?: string) => Promise<Page>,
  items: (page: Page) => Item[],
): AsyncGenerator<Item> {
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    yield* items(page);
    cursor = page.nextCursor ?? undefined;
    if (!cursor) return;
  }
}

function coerceUrl(item: TaskInputLike): { url: string } | TaskInputLike {
  return typeof item === "string" ? { url: item } : item;
}

// `external_id` is caller-supplied but shape-constrained by the API
// (`^[A-Za-z0-9._-]+$`, ≤128 chars). We validate and throw rather than
// coerce, so a bad id fails fast at the call site instead of being
// silently mangled (or rejected later by the server).
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function validateExternalId(value: string, label: string): void {
  if (value.length > 128) {
    throw new Error(`${label} exceeds 128 characters (got ${value.length}).`);
  }
  if (!EXTERNAL_ID_PATTERN.test(value)) {
    throw new Error(
      `${label} ${JSON.stringify(value)} is invalid — must match ^[A-Za-z0-9._-]+$ (letters, digits, \`.\`, \`_\`, \`-\`).`,
    );
  }
}

function validateTaskExternalIds(tasks: readonly { externalId?: string }[] | undefined): void {
  for (const task of tasks ?? []) {
    if (task.externalId !== undefined) validateExternalId(task.externalId, "task externalId");
  }
}

function buildSubmitBody(
  jobType: JobType,
  status: "open" | "closed",
  params: { urls?: TaskInputLike[]; fileInputId?: string } & SubmitFields,
): SubmitJobRequest {
  const { urls, fileInputId } = params;
  // The types make `urls`/`fileInputId` mutually exclusive; these guards
  // still catch untyped (JS) callers and the closed-job "need one" case.
  if (urls !== undefined && fileInputId !== undefined) {
    throw new Error("submit: pass `urls` OR `fileInputId`, not both.");
  }
  if (urls === undefined && fileInputId === undefined && status === "closed") {
    throw new Error(
      "submit: closed jobs require `urls` or `fileInputId` (use submitOpen() to extend later).",
    );
  }
  const body: SubmitJobRequest = { type: jobType, status };
  if (params.zenrowsParams) body.zenrowsParams = params.zenrowsParams;
  if (fileInputId) body.fileInputId = fileInputId;
  if (urls?.length) body.tasks = urls.map(coerceUrl) as SubmitJobRequest["tasks"];
  if (params.externalId) body.externalId = params.externalId;
  if (params.name) body.name = params.name;
  if (params.metadata) body.metadata = params.metadata;
  if (params.webhook) body.webhook = { signature: false, ...params.webhook };
  return body;
}

async function streamToFile(url: string, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const response = await fetch(url);
  if (response.status >= 400 || !response.body) {
    throw new BatchApiError(response.status, null, await response.text().catch(() => ""));
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));
}

// re-export so `WaiterTimeout` is reachable via the client module too.
export { WaiterTimeout };
