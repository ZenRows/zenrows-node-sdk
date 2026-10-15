import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import { ZenRowsBatchClient } from "../src/batch/client";
import { ZenRowsBatchError } from "../src/batch/errors";
import { WaiterFailureError } from "../src/batch/waiters";
import { server } from "./_setup";

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

  test("problem.code is internal when the Problem+JSON body has no code", async () => {
    await expect(
      client.job("job_no_credit").addTasks([{ url: "https://example.com" }]),
    ).rejects.toSatisfy((error: unknown) => {
      const err = error as ZenRowsBatchError;
      expect(err.code).toBe("internal");
      expect(err.problem?.code).toBe("internal");
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

    let sent: unknown;
    server.use(
      http.put("https://async.api.zenrows.com/v1/jobs/job_123/webhook", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ url: "https://example.com/hook2", signature: true });
      }),
    );
    const replaced = await client.putJobWebhook("job_123", {
      url: "https://example.com/hook2",
      signature: true,
    });
    expect(sent).toEqual({ url: "https://example.com/hook2", signature: true });
    expect(replaced).toMatchObject({ url: "https://example.com/hook2", signature: true });

    await expect(client.deleteJobWebhook("job_123")).resolves.toBeUndefined();
  });

  test("putJobWebhook without signature keeps the job's current signing setting", async () => {
    const sent: unknown[] = [];
    let current: { url: string; signature: boolean } | undefined = {
      url: "https://example.com/hook",
      signature: true,
    };
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_wh/webhook", () =>
        current
          ? HttpResponse.json(current)
          : HttpResponse.json(
              { type: "about:blank", title: "Not found", status: 404, code: "not_found" },
              { status: 404, headers: { "Content-Type": "application/problem+json" } },
            ),
      ),
      http.put("https://async.api.zenrows.com/v1/jobs/job_wh/webhook", async ({ request }) => {
        const body = (await request.json()) as { url: string; signature: boolean };
        sent.push(body);
        return HttpResponse.json(body);
      }),
    );

    // Signed webhook, URL changed without saying `signature`: signing stays on.
    await client.putJobWebhook("job_wh", { url: "https://example.com/new" });
    // No webhook yet: the API's submit-time default, unsigned.
    current = undefined;
    await client.putJobWebhook("job_wh", { url: "https://example.com/first" });
    // An explicit value is sent as given.
    await client.putJobWebhook("job_wh", { url: "https://example.com/x", signature: false });

    expect(sent).toEqual([
      { url: "https://example.com/new", signature: true },
      { url: "https://example.com/first", signature: false },
      { url: "https://example.com/x", signature: false },
    ]);
  });

  test("putJobWebhook without signature is a read then a write, not an atomic update", async () => {
    // Documents a known limit: another caller turns signing on between this call's GET and
    // its PUT, and the PUT writes back the value it read. Pass `signature` to avoid it.
    const state = { url: "https://example.com/hook", signature: false };
    let gets = 0;
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_race/webhook", () => {
        gets += 1;
        const seen = { ...state };
        state.signature = true; // the concurrent update lands right after this read
        return HttpResponse.json(seen);
      }),
      http.put("https://async.api.zenrows.com/v1/jobs/job_race/webhook", async ({ request }) => {
        Object.assign(state, await request.json());
        return HttpResponse.json(state);
      }),
    );

    await client.putJobWebhook("job_race", { url: "https://example.com/new" });
    expect(state).toEqual({ url: "https://example.com/new", signature: false });
    expect(gets).toBe(1);

    // With `signature` passed, there is no read, so nothing to race with.
    for (const signature of [false, true]) {
      await client.putJobWebhook("job_race", { url: "https://example.com/new", signature });
      expect(state.signature).toBe(signature);
    }
    expect(gets).toBe(1);
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

  const runRunningThenFailed = () => {
    let calls = 0;
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_cap/runs/run_cap", () => {
        calls += 1;
        return HttpResponse.json({
          run_id: "run_cap",
          job_id: "job_cap",
          status: calls === 1 ? "running" : "failed",
          ...(calls === 1
            ? {}
            : {
                failure_reason: "api_key_cap_reached",
                failure_detail: "API key reached its credit cap",
              }),
        });
      }),
    );
    return () => calls;
  };

  test("waitForRun resolves with a failed run (api_key_cap_reached) instead of timing out", async () => {
    const calls = runRunningThenFailed();
    const client = new ZenRowsBatchClient("API_KEY");
    const run = await client.waitForRun("job_cap", {
      runId: "run_cap",
      pollInterval: 0.01,
      timeout: 0.5,
    });
    expect(calls()).toBe(2);
    expect(run.status).toBe("failed");
    expect(run.failure_reason).toBe("api_key_cap_reached");
    expect(run.failure_detail).toBe("API key reached its credit cap");
  });

  test("run.wait() resolves with a failed run", async () => {
    runRunningThenFailed();
    const client = new ZenRowsBatchClient("API_KEY");
    const handle = await client
      .run("job_cap", "run_cap")
      .wait({ pollInterval: 0.01, timeout: 0.5 });
    expect(handle.data.status).toBe("failed");
    expect(handle.data.failure_reason).toBe("api_key_cap_reached");
    expect(handle.data.failure_detail).toBe("API key reached its credit cap");
  });

  test("failureStatuses containing failed throws, even though failed is a default target", async () => {
    runRunningThenFailed();
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(
      client.waitForRun("job_cap", {
        runId: "run_cap",
        failureStatuses: new Set(["failed"]),
        pollInterval: 0.01,
        timeout: 0.5,
      }),
    ).rejects.toThrow(WaiterFailureError);
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

describe("ZenRowsBatchClient: content, add-tasks idempotency, results paging, timeout", () => {
  test("getTaskContentBytes returns the bytes untouched, getTaskContent returns text", async () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0xe2, 0x9c]);
    server.use(
      http.get(
        "https://async.api.zenrows.com/v1/jobs/job_pdf/tasks/t1/content",
        () => new HttpResponse(pdf, { headers: { "Content-Type": "application/pdf" } }),
      ),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const bytes = await client.getTaskContentBytes("job_pdf", "t1");
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.equals(pdf)).toBe(true);

    const text = await client.getTaskContent("job_123", "task_1");
    expect(text).toBe("<html>latest run content</html>");
  });

  test("addTasks sends Idempotency-Key and is retried on a transient failure", async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post("https://async.api.zenrows.com/v1/jobs/job_open/tasks", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        if (keys.length === 1) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({
          accepted_tasks: 1,
          job_status: "open",
          latest_run: { run_id: "r", job_id: "job_open", run_sequence: 1, status: "running" },
        });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const resp = await client
      .job("job_open")
      .addTasks([{ url: "https://example.com" }], { idempotencyKey: "batch-7" });
    expect(resp.accepted_tasks).toBe(1);
    expect(keys).toEqual(["batch-7", "batch-7"]);
  });

  test("addTasks without a key is not retried", async () => {
    let calls = 0;
    server.use(
      http.post("https://async.api.zenrows.com/v1/jobs/job_open/tasks", () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(
      client.job("job_open").addTasks([{ url: "https://example.com" }]),
    ).rejects.toBeInstanceOf(ZenRowsBatchError);
    expect(calls).toBe(1);
  });

  test("getResults does not send limit, which the results endpoint ignores", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_q/results", ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({ results: [], next_cursor: null });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await client.getResults("job_q", { limit: 50, status: "failed", cursor: "c1" });
    expect(query?.has("limit")).toBe(false);
    expect(query?.get("status")).toBe("failed");
    expect(query?.get("cursor")).toBe("c1");
  });

  test("requests have no time limit unless `timeout` is set", async () => {
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_unhurried", async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json({ job_id: "job_unhurried" });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY", { retries: 0 });
    // No deadline is configured on the transport, matching the behaviour before `timeout`.
    // biome-ignore lint/suspicious/noExplicitAny: reading the private transport to prove it
    expect((client as any).transport.timeoutMs).toBeUndefined();
    await expect(client.getJob("job_unhurried")).resolves.toMatchObject({ jobId: "job_unhurried" });
  });

  test("a request that takes longer than `timeout` seconds is aborted", async () => {
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_slow", async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json({ job_id: "job_slow" });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY", { timeout: 0.05, retries: 0 });
    await expect(client.getJob("job_slow")).rejects.toThrow(/timed out/);
  });
});

describe("ZenRowsBatchClient: task inputs, run-scoped content, webhook read errors", () => {
  test("submitRegular sends string and object tasks, including method and body", async () => {
    let sent: { tasks?: unknown[] } | undefined;
    server.use(
      http.post("https://async.api.zenrows.com/v1/jobs", async ({ request }) => {
        sent = (await request.json()) as { tasks?: unknown[] };
        return HttpResponse.json({ job_id: "job_in", status: "closed", accepted_tasks: 2 });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await client.submitRegular([
      "https://example.com/a",
      { url: "https://example.com/search", method: "POST", body: { q: "shoes" } },
    ]);
    expect(sent?.tasks).toEqual([
      { url: "https://example.com/a" },
      { url: "https://example.com/search", method: "POST", body: { q: "shoes" } },
    ]);
  });

  test("getTaskContentBytes reads an explicit run's content", async () => {
    const client = new ZenRowsBatchClient("API_KEY");
    const bytes = await client.getTaskContentBytes("job_123", "task_1", { runId: "run_1" });
    expect(bytes.toString("utf8")).toBe("<html>run_1 content</html>");
  });

  test("putJobWebhook without signature surfaces a read error other than 404", async () => {
    let puts = 0;
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_denied/webhook", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Forbidden", status: 403, code: "permission_denied" },
          { status: 403, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
      http.put("https://async.api.zenrows.com/v1/jobs/job_denied/webhook", () => {
        puts += 1;
        return HttpResponse.json({});
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(
      client.putJobWebhook("job_denied", { url: "https://example.com/hook" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(puts).toBe(0);
  });
});
