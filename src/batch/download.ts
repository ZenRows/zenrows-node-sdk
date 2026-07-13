/**
 * Bulk-download helpers for the Batch SDK.
 *
 * Two flavours, both with optional concurrency and an `onProgress`
 * callback:
 *
 *  - {@link downloadToDir} writes every task body to a directory on
 *    disk, one at a time so memory stays bounded. Caps: `maxFiles`
 *    (count) and `maxBytesPerFile` (per body).
 *  - {@link downloadToMemory} loads bodies into an array of
 *    {@link DownloadedResult}. Caps: `maxCount`, `maxTotalBytes`, and
 *    `maxBytesPerFile`.
 *
 * `concurrency > 1` fans the body-fetch calls out; results are NOT
 * guaranteed to be in iteration order. The result pagination itself
 * stays single-threaded so we never page faster than we drain.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TaskResult } from "./types.js";

/** The slice of the client the helpers need (kept minimal for testing). */
export interface BodyFetcher {
  iterResultsRaw(
    jobId: string,
    opts: { runId?: string; status?: string },
  ): AsyncIterable<TaskResult>;
  getTaskContentRaw(
    jobId: string,
    taskId: string,
    opts: { runId?: string },
  ): Promise<{ body: Uint8Array; contentType: string }>;
}

/** One row's worth of downloaded content held in memory. */
export interface DownloadedResult {
  taskId: string;
  externalId?: string;
  contentType: string;
  body: Uint8Array;
}

// Safety caps. Conservative defaults — bulk scraping downloads can
// easily reach gigabytes if unbounded.
export const DEFAULT_MAX_FILES = 100_000;
export const DEFAULT_MAX_BYTES_PER_FILE = 50 * 1024 * 1024; // 50 MiB
export const DEFAULT_MAX_COUNT_IN_MEMORY = 10_000;
export const DEFAULT_MAX_TOTAL_BYTES_IN_MEMORY = 500 * 1024 * 1024; // 500 MiB

/** Raised when a download exceeds a configured cap. */
export class DownloadLimitExceeded extends Error {
  constructor(
    readonly limitName: string,
    readonly limit: number,
    readonly observed: number,
  ) {
    super(`download: ${limitName} cap exceeded (${observed} > ${limit})`);
    this.name = "DownloadLimitExceeded";
    Object.setPrototypeOf(this, DownloadLimitExceeded.prototype);
  }
}

export interface DownloadToDirOptions {
  runId?: string;
  status?: string;
  nameFn?: (row: TaskResult) => string;
  useExternalId?: boolean;
  concurrency?: number;
  onProgress?: (done: number) => void;
  maxFiles?: number;
  maxBytesPerFile?: number;
}

export interface DownloadToMemoryOptions {
  runId?: string;
  status?: string;
  concurrency?: number;
  onProgress?: (done: number) => void;
  maxCount?: number;
  maxTotalBytes?: number;
  maxBytesPerFile?: number;
}

/** Stream every matching task's body into `targetDir`. Returns the count. */
export async function downloadToDir(
  client: BodyFetcher,
  jobId: string,
  targetDir: string,
  options: DownloadToDirOptions = {},
): Promise<number> {
  const {
    runId,
    status = "successful",
    useExternalId = false,
    concurrency = 1,
    onProgress,
    maxFiles = DEFAULT_MAX_FILES,
    maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE,
  } = options;
  const nameFn = options.nameFn ?? (useExternalId ? externalIdFilename : defaultFilename);
  await mkdir(targetDir, { recursive: true });

  // `externalId` is caller-controlled and not server-unique, so rows
  // can collide on a filename. The allocator hands the first claimer
  // the bare name and appends `_01`, `_02`, … to later claimers.
  const allocator = new NameAllocator();

  const perRow = async (row: TaskResult): Promise<void> => {
    const { body } = await client.getTaskContentRaw(jobId, row.taskId, { runId });
    if (body.byteLength > maxBytesPerFile) {
      throw new DownloadLimitExceeded("maxBytesPerFile", maxBytesPerFile, body.byteLength);
    }
    const chosen = allocator.claim(nameFn(row));
    const path = join(targetDir, chosen);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  };

  return runBulk(client.iterResultsRaw(jobId, { runId, status }), {
    perRow,
    concurrency,
    onProgress,
    maxRows: maxFiles,
    maxRowsLimitName: "maxFiles",
  });
}

/** Load every matching task body into an array and return it. */
export async function downloadToMemory(
  client: BodyFetcher,
  jobId: string,
  options: DownloadToMemoryOptions = {},
): Promise<DownloadedResult[]> {
  const {
    runId,
    status = "successful",
    concurrency = 1,
    onProgress,
    maxCount = DEFAULT_MAX_COUNT_IN_MEMORY,
    maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES_IN_MEMORY,
    maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE,
  } = options;
  const out: DownloadedResult[] = [];
  let total = 0;

  const perRow = async (row: TaskResult): Promise<void> => {
    const { body, contentType } = await client.getTaskContentRaw(jobId, row.taskId, { runId });
    if (body.byteLength > maxBytesPerFile) {
      throw new DownloadLimitExceeded("maxBytesPerFile", maxBytesPerFile, body.byteLength);
    }
    total += body.byteLength;
    if (total > maxTotalBytes) {
      throw new DownloadLimitExceeded("maxTotalBytes", maxTotalBytes, total);
    }
    out.push({ taskId: row.taskId, externalId: row.externalId, contentType, body });
  };

  await runBulk(client.iterResultsRaw(jobId, { runId, status }), {
    perRow,
    concurrency,
    onProgress,
    maxRows: maxCount,
    maxRowsLimitName: "maxCount",
  });
  return out;
}

// ----- single task -----

export interface DownloadTaskToDirOptions {
  runId?: string;
  useExternalId?: boolean;
  nameFn?: (row: TaskResult) => string;
}

/** Fetch one task's body and write it into `targetDir`; returns the path. */
export async function downloadTaskToDir(
  client: BodyFetcher,
  jobId: string,
  task: TaskResult,
  targetDir: string,
  options: DownloadTaskToDirOptions = {},
): Promise<string> {
  await mkdir(targetDir, { recursive: true });
  const nameFn = options.nameFn ?? (options.useExternalId ? externalIdFilename : defaultFilename);
  const { body } = await client.getTaskContentRaw(jobId, task.taskId, { runId: options.runId });
  const path = join(targetDir, nameFn(task));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return path;
}

/** Fetch one task's body into memory as a {@link DownloadedResult}. */
export async function downloadTaskToMemory(
  client: BodyFetcher,
  jobId: string,
  task: TaskResult,
  options: { runId?: string } = {},
): Promise<DownloadedResult> {
  const { body, contentType } = await client.getTaskContentRaw(jobId, task.taskId, {
    runId: options.runId,
  });
  return { taskId: task.taskId, externalId: task.externalId, contentType, body };
}

// ----- shared driver -----

async function runBulk(
  rows: AsyncIterable<TaskResult>,
  opts: {
    perRow: (row: TaskResult) => Promise<void>;
    concurrency: number;
    onProgress?: (done: number) => void;
    maxRows: number;
    maxRowsLimitName: string;
  },
): Promise<number> {
  const { perRow, concurrency, onProgress, maxRows, maxRowsLimitName } = opts;
  let started = 0;
  let done = 0;
  let firstError: unknown;
  const inFlight = new Set<Promise<void>>();

  const track = (p: Promise<void>): void => {
    const wrapped = p
      .then(() => {
        done += 1;
        onProgress?.(done);
      })
      .catch((err) => {
        if (firstError === undefined) firstError = err;
      })
      .finally(() => {
        inFlight.delete(wrapped);
      });
    inFlight.add(wrapped);
  };

  for await (const row of rows) {
    if (firstError !== undefined) break;
    if (started >= maxRows) {
      throw new DownloadLimitExceeded(maxRowsLimitName, maxRows, started + 1);
    }
    started += 1;
    track(perRow(row));
    if (inFlight.size >= Math.max(1, concurrency)) await Promise.race(inFlight);
  }
  await Promise.all(inFlight);
  if (firstError !== undefined) throw firstError;
  return done;
}

// ----- filename helpers -----

function extFor(row: TaskResult): string {
  return row.type ?? "bin";
}

function defaultFilename(row: TaskResult): string {
  return `${row.taskId}.${extFor(row)}`;
}

function externalIdFilename(row: TaskResult): string {
  // Coerce to a safe filename here (file-creation boundary), independent of
  // submit-time validation: an `external_id` can also arrive via CSV/server,
  // so writing to the filesystem must never trust it. Non-`[A-Za-z0-9._-]`
  // chars become `_`; falls back to the collision-free task_id when absent.
  const raw = row.externalId ?? "";
  const safe = [...raw].map((c) => (/[A-Za-z0-9._-]/.test(c) ? c : "_")).join("");
  return `${safe || row.taskId}.${extFor(row)}`;
}

/**
 * Hands out unique filenames against a running set. `claim` is
 * synchronous, so it stays atomic under interleaved async workers.
 */
class NameAllocator {
  private readonly counts = new Map<string, number>();

  claim(name: string): string {
    const n = this.counts.get(name) ?? 0;
    this.counts.set(name, n + 1);
    if (n === 0) return name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    return `${stem}_${String(n).padStart(2, "0")}${ext}`;
  }
}
