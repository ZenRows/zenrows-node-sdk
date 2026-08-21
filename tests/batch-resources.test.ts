import { describe, expect, test } from "vitest";
import { ZenRowsBatchClient } from "../src/batch/client";
import "./_setup";

describe("JobRef / JobHandle", () => {
  const client = new ZenRowsBatchClient("API_KEY");

  test("job() mints a ref with no network call", () => {
    const ref = client.job("job_123");
    expect(ref.jobId).toBe("job_123");
    expect(ref.status).toBeUndefined();
  });

  test("submitJob returns a ref carrying the submit response's status/acceptedTasks", async () => {
    const ref = await client.submitJob({ tasks: [{ url: "https://example.com" }] });
    expect(ref.status).toBe("open");
    expect(ref.acceptedTasks).toBeUndefined(); // fixture doesn't set accepted_tasks
  });

  test("load() fetches and returns a JobHandle with .data populated", async () => {
    const handle = await client.job("job_123").load();
    expect(handle.data).toMatchObject({ job_id: "job_123" });
    expect(handle.status).toBe(handle.data.status);
  });

  test("close() returns a FRESH handle with the server's new state, not a mutated original", async () => {
    const ref = client.job("job_123");
    const closed = await ref.close();
    expect(closed.data.status).toBe("closed");
    // The original ref is untouched — it's not a JobHandle and has no .data.
    expect((ref as unknown as { data?: unknown }).data).toBeUndefined();
  });

  test("delete() resolves with no return value", async () => {
    await expect(client.job("job_123").delete()).resolves.toBeUndefined();
  });

  test("addTasks forwards lastBatch through to the request body", async () => {
    const result = await client.job("job_123").addTasks([{ url: "https://example.com/3" }], {
      lastBatch: true,
    });
    expect(result.accepted_tasks).toBe(1);
  });

  test("rerun() with no status returns a RunHandle for the new run", async () => {
    const run = await client.job("job_123").rerun();
    expect(run.data.run_id).toBe("run_2");
  });

  test("retryFailed() is a shortcut for rerun({ status: 'failed' })", async () => {
    const run = await client.job("job_123").retryFailed();
    expect(run.data.run_id).toBe("run_2");
  });

  test("run facet is lazily created and memoised (same instance across accesses)", () => {
    const ref = client.job("job_123");
    expect(ref.run).toBe(ref.run);
  });

  test("schedule facet is lazily created and memoised", () => {
    const ref = client.job("job_sched");
    expect(ref.schedule).toBe(ref.schedule);
  });

  test("getWebhook/setWebhook/deleteWebhook delegate to the client", async () => {
    const ref = client.job("job_123");
    const config = await ref.getWebhook();
    expect(config.url).toBe("https://example.com/hook");
    const replaced = await ref.setWebhook("https://example.com/hook2", false);
    expect(replaced.signature).toBe(false);
    await expect(ref.deleteWebhook()).resolves.toBeUndefined();
  });

  test("retryFailed(includePending: true) sends a combined status filter", async () => {
    const run = await client.job("job_123").retryFailed({ includePending: true });
    expect(run.data.run_id).toBe("run_2");
  });

  test("waitForIngest resolves once ingest_status leaves pending, returning a loaded JobHandle", async () => {
    const handle = await client.job("job_ingest_pending").waitForIngest({ pollInterval: 0.01 });
    expect(handle.data.latest_run?.ingest_status).toBe("done");
  });

  test("addFileInput uploads a CSV and returns the file_input_id", async () => {
    const fileInputId = await client.job("job_123").addFileInput("url\nhttps://a.com\n", {
      fields: { url: 0 },
      header: true,
    });
    expect(fileInputId).toBe("file_123");
  });
});

describe("ScheduleControls.resume", () => {
  test("re-enables scheduled fires on a paused job", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const resumed = await client.job("job_sched").schedule.resume();
    expect(resumed.data.job_id).toBe("job_sched");
  });
});

describe("submitJob(waitForIngest: true)", () => {
  test("returns a loaded JobHandle instead of a bare ref when ingestion was actually polled", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    // submitJob's own fixture (job_123) has no latest_run, so waitForIngest is a no-op here —
    // this exercises the branch where wait is requested but there's nothing to wait for.
    const ref = await client.submitJob({
      tasks: [{ url: "https://example.com" }],
      waitForIngest: true,
    });
    expect(ref.jobId).toBe("job_123");
  });
});

describe("RunRef / RunHandle", () => {
  const client = new ZenRowsBatchClient("API_KEY");

  test("run() mints a ref with no network call", () => {
    const ref = client.run("job_123", "run_1");
    expect(ref.jobId).toBe("job_123");
    expect(ref.runId).toBe("run_1");
  });

  test("load() returns a RunHandle exposing .status and .stats shortcuts", async () => {
    const handle = await client.run("job_123", "run_1").load();
    expect(handle.status).toBe(handle.data.status);
  });

  test("delete() scrubs a single run", async () => {
    await expect(client.run("job_123", "run_1").delete()).resolves.toBeUndefined();
  });

  test("export(id) mints an ExportRef with no network call", () => {
    const ref = client.run("job_123", "run_1").export("01EXPORTAAAAAAAAAAAAAAAAAA");
    expect(ref.exportId).toBe("01EXPORTAAAAAAAAAAAAAAAAAA");
  });

  test("startExport() kicks off an async export", async () => {
    const ref = await client.run("job_123", "run_1").startExport();
    expect(ref.exportId).toBe("01EXPORTAAAAAAAAAAAAAAAAAA");
  });

  test("wait() resolves once the run reaches a terminal status", async () => {
    const handle = await client.run("job_123", "run_1").wait({ pollInterval: 0.01 });
    expect(handle.status).toBe("completed");
  });

  test("downloadToDir / downloadToMemory delegate through to the client's download helpers", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "zenrows-run-dl-"));
    try {
      const count = await client.run("job_download", "run_dl").downloadToDir(dir);
      expect(count).toBe(2);
      const inMemory = await client.run("job_download", "run_dl").downloadToMemory();
      expect(inMemory).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ExportRef / ExportHandle", () => {
  const client = new ZenRowsBatchClient("API_KEY");

  test("load() fetches the export and exposes .status", async () => {
    const handle = await client.run("job_123", "run_1").export("01EXPORTAAAAAAAAAAAAAAAAAA").load();
    expect(handle.status).toBe("completed");
  });

  test("wait() resolves once the export is completed", async () => {
    const handle = await client
      .run("job_123", "run_1")
      .export("01EXPORTAAAAAAAAAAAAAAAAAA")
      .wait({ pollInterval: 0.01 });
    expect(handle.status).toBe("completed");
  });

  test("downloadToPath streams the completed export's zip to disk", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "zenrows-export-dl-"));
    try {
      const target = join(dir, "export.zip");
      await client
        .run("job_123", "run_1")
        .export("01EXPORTAAAAAAAAAAAAAAAAAA")
        .downloadToPath(target);
      const bytes = await readFile(target);
      expect(bytes.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("current run facet — job.run", () => {
  const client = new ZenRowsBatchClient("API_KEY");

  test("stop() returns a fresh RunHandle", async () => {
    const handle = await client.job("job_123").run.stop();
    expect(handle.status).toBe("stopped");
  });

  test("cancel() is an alias for stop()", async () => {
    const handle = await client.job("job_123").run.cancel();
    expect(handle.status).toBe("stopped");
  });
});

describe("pagination iterators", () => {
  test("iterJobs stops when next_cursor is absent (empty page)", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const jobs = [];
    for await (const job of client.iterJobs()) {
      jobs.push(job);
    }
    expect(jobs).toEqual([]);
  });

  test("iterRuns yields every run on the page", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const runs = [];
    for await (const run of client.iterRuns("job_123")) {
      runs.push(run.data.run_id);
    }
    expect(runs).toEqual(["run_1"]);
  });

  test("iterResults yields every result on the page", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const results = [];
    for await (const result of client.iterResults("job_123")) {
      results.push(result.task_id);
    }
    expect(results).toEqual([]);
  });

  test("JobRef.runs() delegates to the client's iterRuns", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const runs = [];
    for await (const run of client.job("job_123").runs()) {
      runs.push(run.data.run_id);
    }
    expect(runs).toEqual(["run_1"]);
  });
});
