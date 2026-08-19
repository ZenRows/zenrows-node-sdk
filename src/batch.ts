import packageJson from "../package.json" with { type: "json" };

const DEFAULT_BATCH_API_URL = "https://async.api.zenrows.com/v1";

export interface BatchClientConfig {
  /** Override the Batch API base URL. Matches the `WithBaseURL`/`base_url` override the Go and Python SDKs' batch clients accept. */
  baseURL?: string;
}

export type JobType = "regular" | "scheduled";
export type JobStatus = "open" | "closed" | "deleted";

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
  /**
   * "open" keeps the job accepting more tasks via `addTasks()` until you call `closeJob()` —
   * useful when you're streaming URLs in over time. Omit this (or pass "closed") for a normal
   * one-shot batch where every task is already known at submit time.
   */
  status?: JobStatus;
  zenrows_params?: Record<string, unknown>;
  tasks?: BatchTask[];
  file_input_id?: string;
  external_id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  webhook?: BatchWebhookConfig;
  idempotencyKey?: string;
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
}

export class ZenRowsBatchError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(status: number, problem: unknown) {
    super(`ZenRows Batch API request failed with status ${status}`);
    this.name = "ZenRowsBatchError";
    this.status = status;
    this.problem = problem;
  }
}

/**
 * Client for the ZenRows Batch API (async, job/run/task model). Usable standalone
 * (`new ZenRowsBatchClient(apiKey)`, matching the Go and Python SDKs' batch clients) or via
 * the `client.batch` convenience property on a `ZenRows` instance — same object either way.
 * Covers the core open/closed job lifecycle: submit, add tasks to an open job, close it,
 * inspect runs, and page through results.
 *
 * Not yet covered here (submit a follow-up if you need one): scheduling
 * (`PUT /jobs/{id}/schedule`), webhook config CRUD, HMAC key rotation, CSV job-input
 * uploads, and results exports. Those endpoints exist server-side; this client just
 * doesn't wrap them yet.
 */
export class ZenRowsBatchClient {
  readonly apiKey: string;
  private readonly baseURL: string;

  constructor(apiKey: string, config: BatchClientConfig = {}) {
    this.apiKey = apiKey;
    this.baseURL = config.baseURL ?? DEFAULT_BATCH_API_URL;
  }

  submitJob(options: SubmitJobOptions = {}) {
    const { idempotencyKey, ...body } = options;
    return this.request("POST", "/jobs", { body, idempotencyKey });
  }

  listJobs(options: ListJobsOptions = {}) {
    return this.request("GET", "/jobs", { query: options });
  }

  getJob(jobId: string) {
    return this.request("GET", `/jobs/${jobId}`);
  }

  deleteJob(jobId: string) {
    return this.request("DELETE", `/jobs/${jobId}`);
  }

  /**
   * Append tasks to a job created with `status: "open"`. Fails once the job is closed.
   * Pass `lastBatch: true` to close the job as part of this call (equivalent to a
   * following `closeJob()`).
   */
  addTasks(jobId: string, tasks: BatchTask[], options: { lastBatch?: boolean } = {}) {
    return this.request("POST", `/jobs/${jobId}/tasks`, {
      body: { tasks, last_batch: options.lastBatch ?? false },
    });
  }

  /** Signal that no more tasks are coming for an open job. Idempotent once closed. */
  closeJob(jobId: string) {
    return this.request("POST", `/jobs/${jobId}/close`);
  }

  /** Stops the latest run. 409 if it's not in a stoppable state (e.g. already completed). */
  stopRun(jobId: string) {
    return this.request("POST", `/jobs/${jobId}/stop`);
  }

  /**
   * Starts a new run. Omit `status` for a full replay of every task from the previous run;
   * pass a comma-separated `status` (e.g. `"failed"` or `"failed,pending"`) to retry only
   * tasks in those states, inheriting the rest. `idempotencyKey` makes a repeated call return
   * the original new-run response instead of starting a second run.
   */
  rerun(jobId: string, options: { status?: string; idempotencyKey?: string } = {}) {
    const { status, idempotencyKey } = options;
    return this.request("POST", `/jobs/${jobId}/rerun`, {
      query: status ? { status } : undefined,
      idempotencyKey,
    });
  }

  listRuns(jobId: string, options: { limit?: number; cursor?: string } = {}) {
    return this.request("GET", `/jobs/${jobId}/runs`, { query: options });
  }

  getRun(jobId: string, runId: string) {
    return this.request("GET", `/jobs/${jobId}/runs/${runId}`);
  }

  deleteRun(jobId: string, runId: string) {
    return this.request("DELETE", `/jobs/${jobId}/runs/${runId}`);
  }

  getResults(jobId: string, options: GetResultsOptions = {}) {
    const { runId, ...query } = options;
    const path = runId ? `/jobs/${jobId}/runs/${runId}/results` : `/jobs/${jobId}/results`;
    return this.request("GET", path, { query });
  }

  /**
   * Returns the scraped page's raw content as-is — whatever the target page's body was
   * (HTML, plain text, or JSON text you can `JSON.parse()` yourself). Unlike every other
   * batch method, this is never itself a JSON envelope, so it bypasses `request()`.
   */
  async getTaskContent(
    jobId: string,
    taskId: string,
    options: { runId?: string } = {},
  ): Promise<string> {
    const path = options.runId
      ? `/jobs/${jobId}/runs/${options.runId}/tasks/${taskId}/content`
      : `/jobs/${jobId}/tasks/${taskId}/content`;
    const response = await this.fetchRaw("GET", path);

    if (!response.ok) {
      const problem = await response.json().catch(() => undefined);
      throw new ZenRowsBatchError(response.status, problem);
    }
    return response.text();
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: {
      query?: object;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    const response = await this.fetchRaw(method, path, options);

    if (!response.ok) {
      const problem = await response.json().catch(() => undefined);
      throw new ZenRowsBatchError(response.status, problem);
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  private fetchRaw(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: {
      query?: object;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<Response> {
    const url = new URL(`${this.baseURL}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query as Record<string, unknown>)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "User-Agent": `zenrows/${packageJson.version} node`,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    return fetch(url.toString(), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  }
}
