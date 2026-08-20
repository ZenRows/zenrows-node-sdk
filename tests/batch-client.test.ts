import { beforeEach, describe, expect, test } from "vitest";
import { ZenRowsBatchClient } from "../src/batch/client";
import { ZenRowsBatchError } from "../src/batch/errors";
import "./_setup";

describe("ZenRowsBatchClient — retry/backoff transport", () => {
  let client: ZenRowsBatchClient;

  beforeEach(() => {
    client = new ZenRowsBatchClient("API_KEY");
  });

  test("retries a GET on 503 and eventually succeeds", async () => {
    const job = await client.getJob("job_retry_then_ok");
    expect(job.data).toMatchObject({ job_id: "job_retry_then_ok" });
  });

  test("honors Retry-After on a 429", async () => {
    const job = await client.getJob("job_retry_after");
    expect(job.data).toMatchObject({ job_id: "job_retry_after" });
  });

  test("retries a GET on a network-level failure (not an HTTP status)", async () => {
    const job = await client.getJob("job_network_blip");
    expect(job.data).toMatchObject({ job_id: "job_network_blip" });
  });

  test("does not retry a POST without an Idempotency-Key, even on a retryable status", async () => {
    await expect(
      client.job("job_no_retry_post").addTasks([{ url: "https://example.com" }]),
    ).rejects.toThrow(ZenRowsBatchError);
  });
});

describe("ZenRowsBatchClient — error shape", () => {
  let client: ZenRowsBatchClient;

  beforeEach(() => {
    client = new ZenRowsBatchClient("API_KEY");
  });

  test("carries status, code, and problem detail from a Problem+JSON body", async () => {
    await expect(
      client.job("job_no_credit").addTasks([{ url: "https://example.com" }]),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ZenRowsBatchError);
      const err = error as ZenRowsBatchError;
      expect(err.status).toBe(402);
      expect(err.problem?.title).toBe("Payment Required");
      return true;
    });
  });

  test("degrades gracefully on a non-JSON error body, still carrying the real status", async () => {
    await expect(client.getJob("job_broken_upstream")).rejects.toSatisfy((error: unknown) => {
      const err = error as ZenRowsBatchError;
      expect(err.status).toBe(502);
      expect(err.problem).toBeUndefined();
      expect(err.code).toBe("internal");
      return true;
    });
  });
});

describe("ZenRowsBatchClient — submit* validation", () => {
  let client: ZenRowsBatchClient;

  beforeEach(() => {
    client = new ZenRowsBatchClient("API_KEY");
  });

  test("submitRegular rejects passing both urls and fileInputId", async () => {
    await expect(client.submitRegular(["https://a.com"], "file_1")).rejects.toThrow(
      /urls OR fileInputId/,
    );
  });

  test("submitRegular rejects passing neither urls nor fileInputId", async () => {
    await expect(client.submitRegular()).rejects.toThrow(/require urls or fileInputId/);
  });

  test("submitOpen allows starting with no tasks at all", async () => {
    const ref = await client.submitOpen();
    expect(ref.jobId).toBe("job_123");
  });

  test("submitScheduled rejects passing both urls and fileInputId", async () => {
    const { Rate } = await import("../src/batch/schedule");
    await expect(
      client.submitScheduled(new Rate(15, "minute"), ["https://a.com"], "file_1"),
    ).rejects.toThrow(/urls OR fileInputId/);
  });
});

describe("ZenRowsBatchClient — webhooks", () => {
  let client: ZenRowsBatchClient;

  beforeEach(() => {
    client = new ZenRowsBatchClient("API_KEY");
  });

  test("gets, replaces, and deletes a job's webhook config", async () => {
    const current = await client.getJobWebhook("job_123");
    expect(current).toMatchObject({ url: "https://example.com/hook", signature: true });

    const replaced = await client.putJobWebhook("job_123", { url: "https://example.com/hook2" });
    expect(replaced).toMatchObject({ url: "https://example.com/hook2", signature: false });

    await expect(client.deleteJobWebhook("job_123")).resolves.toBeUndefined();
  });

  test("dispatches a synthetic test event", async () => {
    const result = await client.testWebhook({ url: "https://example.com/hook" });
    expect(result).toMatchObject({ delivered: true, status_code: 200 });
  });
});

describe("ZenRowsBatchClient — HMAC key lifecycle", () => {
  let client: ZenRowsBatchClient;

  beforeEach(() => {
    client = new ZenRowsBatchClient("API_KEY");
  });

  test("lists, rotates, finalizes, and cancels rotation", async () => {
    const list = await client.listHmacKeys();
    expect(list.active?.kid).toBe("01AAAAAAAAAAAAAAAAAAAAAAAA");

    const created = await client.rotateHmacKey();
    expect(created.secret).toBe("c2VjcmV0");

    const finalized = await client.finalizeHmacKey();
    expect(finalized.active_kid).toBe("01BBBBBBBBBBBBBBBBBBBBBBBB");

    await expect(client.cancelHmacRotation()).resolves.toBeUndefined();
  });
});

describe("ZenRowsBatchClient — CSV upload", () => {
  let client: ZenRowsBatchClient;

  beforeEach(() => {
    client = new ZenRowsBatchClient("API_KEY");
  });

  test("allocates a slot then PUTs the body to the presigned URL, returning file_input_id", async () => {
    const fileInputId = await client.uploadCsv("url\nhttps://a.com\n", {
      fields: { url: 0 },
      header: true,
    });
    expect(fileInputId).toBe("file_123");
  });
});

describe("ZenRowsBatchClient — task history", () => {
  test("returns the attempt history for a task", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const history = await client.getTaskHistory("job_123", "task_1");
    expect(history.events).toHaveLength(1);
    expect(history.events[0]).toMatchObject({ attempt: 1 });
  });
});

describe("ZenRowsBatchClient — results export", () => {
  test("starts an export, waits for completion, and reports the download URL", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const exportRef = await client.startResultsExport("job_123", "run_1");
    expect(exportRef.exportId).toBe("01EXPORTAAAAAAAAAAAAAAAAAA");

    const final = await client.waitForExport("job_123", "run_1", exportRef.exportId, {
      pollInterval: 0.01,
    });
    expect(final).toMatchObject({
      status: "completed",
      download_url: "https://storage.example.test/export.zip",
    });
  });
});

describe("ZenRowsBatchClient — waitForRun / downloadAllResults", () => {
  test("waitForRun resolves once the run reaches a terminal status", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const run = await client.waitForRun("job_123", { runId: "run_1", pollInterval: 0.01 });
    expect(run.status).toBe("completed");
  });

  test("downloadAllResults starts an export, waits, and streams the zip to disk", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const client = new ZenRowsBatchClient("API_KEY");
    const dir = await mkdtemp(join(tmpdir(), "zenrows-batch-all-"));
    try {
      const target = join(dir, "all.zip");
      const written = await client.downloadAllResults("job_123", "run_1", target, {
        pollInterval: 0.01,
      });
      expect(written).toBe(target);
      expect((await readFile(target)).length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ZenRowsBatchClient — error parsing edge cases", () => {
  test("parseProblem tolerates a non-object JSON body (e.g. a bare array or string)", async () => {
    const { parseProblem } = await import("../src/batch/errors");
    const response = new Response(JSON.stringify(["not", "an", "object"]), { status: 500 });
    const { problem, extras } = await parseProblem(response);
    expect(problem).toBeUndefined();
    expect(extras).toBeUndefined();
  });

  test("parseProblem preserves non-standard fields as extras", async () => {
    const { parseProblem } = await import("../src/batch/errors");
    const response = new Response(
      JSON.stringify({
        type: "about:blank",
        title: "Bad",
        status: 400,
        code: "invalid_tasks",
        invalid_tasks: [1, 2],
      }),
      { status: 400 },
    );
    const { problem, extras } = await parseProblem(response);
    expect(problem?.code).toBe("invalid_tasks");
    expect(extras).toEqual({ invalid_tasks: [1, 2] });
  });
});

describe("ZenRowsBatchClient — scheduling", () => {
  test("replaces a job's schedule and pauses/resumes it", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const job = client.job("job_sched");
    const { Rate } = await import("../src/batch/schedule");
    const updated = await job.schedule.update(new Rate(15, "minute"));
    expect(updated.data.job_id).toBe("job_sched");

    const paused = await job.schedule.pause();
    expect(paused.data.schedule_state).toBe("paused");
  });
});

describe("ZenRowsBatchClient — current-run pause/resume", () => {
  test("pauses and resumes the current run", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const job = client.job("job_123");

    const paused = await job.run.pause();
    expect(paused.data.pause_state).toBe("paused");

    const resumed = await job.run.resume();
    expect(resumed.data.pause_state).toBe("active");
  });
});
