import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { TaskResult } from "./types.js";

export const DEFAULT_MAX_FILES = 100_000;
export const DEFAULT_MAX_BYTES_PER_FILE = 50 * 1024 * 1024;
export const DEFAULT_MAX_COUNT_IN_MEMORY = 10_000;
export const DEFAULT_MAX_TOTAL_BYTES_IN_MEMORY = 500 * 1024 * 1024;

export interface DownloadedResult {
  taskId: string;
  externalId?: string;
  url: string;
  body: Buffer;
}

/**
 * A result row a bulk download left out because it has no body to fetch: an `expired` row
 * (a successful result past the retention window) or a `failed` task. Reported through the
 * `onSkip` option of `downloadToDir` / `downloadToMemory`.
 */
export interface SkippedResult {
  taskId: string;
  externalId?: string;
  url: string;
  status: "expired" | "failed";
}

/** Statuses whose rows have no stored body by design, so a bulk download skips them. */
const SKIPPABLE_STATUSES = new Set(["expired", "failed"]);

/**
 * Split `results` into rows to fetch and rows to skip, enforcing `limit`. Only `expired`
 * and `failed` rows without a `result_url` are skipped; any other row without one (a
 * `successful` row missing its URL, or an unfinished task) stays in, so fetching it fails
 * loudly instead of being dropped.
 */
async function partition(
  results: AsyncIterable<TaskResult>,
  limit: number,
  limitName: string,
  onSkip: ((row: SkippedResult) => void) | undefined,
): Promise<TaskResult[]> {
  const fetchable: TaskResult[] = [];
  for await (const task of results) {
    if (!task.result_url && SKIPPABLE_STATUSES.has(task.status)) {
      onSkip?.({
        taskId: task.task_id,
        externalId: task.external_id,
        url: task.url,
        status: task.status as SkippedResult["status"],
      });
      continue;
    }
    fetchable.push(task);
    if (fetchable.length > limit) {
      throw new Error(`result count exceeds ${limitName} (${limit})`);
    }
  }
  return fetchable;
}

/**
 * Every result body lives at a presigned `result_url` — no auth header, no API content
 * endpoint in the loop, matching the Python SDK's approach exactly.
 */
async function fetchResultBody(task: TaskResult, maxBytes?: number): Promise<Buffer> {
  if (!task.result_url) {
    const why =
      task.status === "expired"
        ? "its result is past the retention window (status expired)"
        : `it has no stored result (status ${task.status})`;
    throw new Error(`task ${task.task_id} has no result_url: ${why}`);
  }
  const response = await fetch(task.result_url);
  if (!response.ok) {
    throw new Error(`downloading task ${task.task_id} failed with status ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (maxBytes !== undefined && buffer.byteLength > maxBytes) {
    throw new Error(
      `task ${task.task_id}'s body (${buffer.byteLength} bytes) exceeds maxBytesPerFile (${maxBytes})`,
    );
  }
  return buffer;
}

/** Run `worker` over `items` with at most `concurrency` in flight at once. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const errors: unknown[] = [];
  async function next(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await worker(items[index] as T, index);
      } catch (error) {
        errors.push(error);
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, concurrency) }, () => next());
  await Promise.all(workers);
  if (errors.length) {
    throw errors[0];
  }
}

function defaultFileName(task: TaskResult, useExternalId: boolean): string {
  const base = useExternalId && task.external_id ? task.external_id : task.task_id;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface DownloadToDirOptions {
  status?: string;
  nameFn?: (task: TaskResult) => string;
  useExternalId?: boolean;
  concurrency?: number;
  maxFiles?: number;
  maxBytesPerFile?: number;
  /** Called for each `expired` or `failed` row skipped because it has no body to fetch. */
  onSkip?: (row: SkippedResult) => void;
}

/**
 * Write every task body in `results` to `targetDir`, one file per task, and return how many
 * files it wrote. `expired` and `failed` rows have no body: they are skipped (and passed to
 * `onSkip`) instead of failing the download. Any other row without a `result_url` still
 * fails it.
 */
export async function downloadToDir(
  results: AsyncIterable<TaskResult>,
  targetDir: string,
  {
    nameFn,
    useExternalId = false,
    concurrency = 1,
    maxFiles = DEFAULT_MAX_FILES,
    maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE,
    onSkip,
  }: DownloadToDirOptions = {},
): Promise<number> {
  await mkdir(targetDir, { recursive: true });
  const tasks = await partition(results, maxFiles, "maxFiles", onSkip);

  await runPool(tasks, concurrency, async (task: TaskResult) => {
    const body = await fetchResultBody(task, maxBytesPerFile);
    const fileName = nameFn ? nameFn(task) : defaultFileName(task, useExternalId);
    const filePath = join(targetDir, fileName);
    await mkdir(dirname(filePath), { recursive: true });
    await pipeline(Readable.from(body), createWriteStream(filePath));
  });

  return tasks.length;
}

export interface DownloadToMemoryOptions {
  concurrency?: number;
  maxCount?: number;
  maxTotalBytes?: number;
  maxBytesPerFile?: number;
  /** Called for each `expired` or `failed` row skipped because it has no body to fetch. */
  onSkip?: (row: SkippedResult) => void;
}

/**
 * Load every task body in `results` into memory. `expired` and `failed` rows have no body:
 * they are skipped (and passed to `onSkip`). Any other row without a `result_url` still
 * fails the download.
 */
export async function downloadToMemory(
  results: AsyncIterable<TaskResult>,
  {
    concurrency = 1,
    maxCount = DEFAULT_MAX_COUNT_IN_MEMORY,
    maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES_IN_MEMORY,
    maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE,
    onSkip,
  }: DownloadToMemoryOptions = {},
): Promise<DownloadedResult[]> {
  const tasks = await partition(results, maxCount, "maxCount", onSkip);

  const downloaded: DownloadedResult[] = new Array(tasks.length);
  let totalBytes = 0;
  await runPool(tasks, concurrency, async (task: TaskResult, index: number) => {
    const body = await fetchResultBody(task, maxBytesPerFile);
    totalBytes += body.byteLength;
    if (totalBytes > maxTotalBytes) {
      throw new Error(`total downloaded bytes exceeds maxTotalBytes (${maxTotalBytes})`);
    }
    downloaded[index] = { taskId: task.task_id, externalId: task.external_id, url: task.url, body };
  });

  return downloaded;
}

export async function downloadTaskToFile(task: TaskResult, target: string): Promise<void> {
  const body = await fetchResultBody(task);
  await mkdir(dirname(target), { recursive: true });
  await pipeline(Readable.from(body), createWriteStream(target));
}

export async function downloadTaskToMemory(task: TaskResult): Promise<Buffer> {
  return fetchResultBody(task);
}
