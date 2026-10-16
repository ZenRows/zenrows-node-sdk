import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { http, HttpResponse } from "msw";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  At,
  BatchErrorCode,
  type BatchErrorCodeValue,
  type Run,
  RunPausedError,
  type TaskResult,
  type TaskStatus,
  WaiterTimeoutError,
  type WebhookEvent,
  ZenRowsBatchClient,
  ZenRowsBatchError,
} from "../src";
import { server } from "./_setup";

const API = "https://async.api.zenrows.com/v1";

function problem(status: number, code: string, headers: Record<string, string> = {}) {
  return HttpResponse.json(
    { type: `https://docs.zenrows.com/api-error-codes#${code}`, title: "Error", status, code },
    { status, headers: { "Content-Type": "application/problem+json", ...headers } },
  );
}

describe("429 quota_exceeded", () => {
  test("is an account limit, so it is not retried", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/jobs/job_quota`, () => {
        calls += 1;
        return problem(429, "quota_exceeded");
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const error = await client.getJob("job_quota").catch((e) => e);
    expect(error).toBeInstanceOf(ZenRowsBatchError);
    expect(error.code).toBe(BatchErrorCode.QuotaExceeded);
    expect(calls).toBe(1);
  });

  test("is not retried on a submit that carries an Idempotency-Key either", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/jobs`, () => {
        calls += 1;
        return problem(429, "quota_exceeded");
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(
      client.submitRegular(["https://example.com"], undefined, { idempotencyKey: "k1" }),
    ).rejects.toMatchObject({ status: 429, code: "quota_exceeded" });
    expect(calls).toBe(1);
  });

  test("another 429 is still retried", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/jobs/job_busy`, () => {
        calls += 1;
        if (calls === 1) return problem(429, "too_many_requests", { "Retry-After": "0" });
        return HttpResponse.json({ job_id: "job_busy", type: "regular", status: "closed" });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(client.getJob("job_busy")).resolves.toMatchObject({ jobId: "job_busy" });
    expect(calls).toBe(2);
  });
});

describe("ZenRowsBatchError fields", () => {
  test("exposes detail and Retry-After seconds", async () => {
    server.use(
      http.get(`${API}/jobs/job_detail`, () =>
        HttpResponse.json(
          {
            type: "https://docs.zenrows.com/api-error-codes#api_key_cap_reached",
            title: "Payment Required",
            status: 402,
            code: "api_key_cap_reached",
            detail: "monthly cap reached",
          },
          {
            status: 402,
            headers: { "Content-Type": "application/problem+json", "Retry-After": "120" },
          },
        ),
      ),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const error = (await client.getJob("job_detail").catch((e) => e)) as ZenRowsBatchError;
    expect(error.code).toBe(BatchErrorCode.ApiKeyCapReached);
    expect(error.detail).toBe("monthly cap reached");
    expect(error.retryAfter).toBe(120);
  });

  test("BatchErrorCode names the codes the API sends", () => {
    expect(BatchErrorCode.SubscriptionInactive).toBe("subscription_inactive");
    expect(BatchErrorCode.PaymentRequired).toBe("payment_required");
    expect(BatchErrorCode.ResultExpired).toBe("result_expired");
    expect(BatchErrorCode.PartialRerunWindowExpired).toBe("partial_rerun_window_expired");
    expect(BatchErrorCode.IdempotencyKeyConflict).toBe("idempotency_key_conflict");
    // Every value is unique and snake_case.
    const values = Object.values(BatchErrorCode);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expectTypeOf<"quota_exceeded">().toMatchTypeOf<BatchErrorCodeValue>();
  });
});

describe("content of an expired result", () => {
  test("getTaskContent throws 410 result_expired", async () => {
    server.use(
      http.get(`${API}/jobs/job_old/tasks/t1/content`, () => problem(410, "result_expired")),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(client.getTaskContent("job_old", "t1")).rejects.toMatchObject({
      status: 410,
      code: BatchErrorCode.ResultExpired,
    });
  });
});

describe("waiting for ingestion", () => {
  function runBody(runId: string, status: string, ingest: string) {
    return {
      run_id: runId,
      job_id: "job_rr",
      run_sequence: 2,
      status,
      ingest_status: ingest,
      stats: { total: 3, completed: 0, successful: 0, failed: 0 },
    };
  }

  test("rerun({ waitForIngest: true }) waits on the returned run, not the job's latest", async () => {
    // A replayed rerun returns its original run (run_2) while run_3 is now the latest and
    // still ingesting. The wait must follow run_2.
    const runReads: string[] = [];
    let jobReads = 0;
    server.use(
      http.post(`${API}/jobs/job_rr/rerun`, () =>
        HttpResponse.json(
          {
            job_id: "job_rr",
            status: "closed",
            latest_run: runBody("run_2", "pending", "pending"),
            retried_tasks: 3,
            inherited_tasks: 0,
          },
          { status: 202 },
        ),
      ),
      http.get(`${API}/jobs/job_rr/runs/:runId`, ({ params }) => {
        runReads.push(String(params.runId));
        return HttpResponse.json(runBody(String(params.runId), "completed", "done"));
      }),
      http.get(`${API}/jobs/job_rr`, () => {
        jobReads += 1;
        return HttpResponse.json({
          job_id: "job_rr",
          type: "regular",
          status: "closed",
          latest_run: runBody("run_3", "running", "pending"),
        });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const run = await client
      .job("job_rr")
      .retryFailed({ idempotencyKey: "replayed", waitForIngest: true });
    expect(run.runId).toBe("run_2");
    expect(run.data.ingest_status).toBe("done");
    expect(runReads).toEqual(["run_2"]);
    expect(jobReads).toBe(0);

    // Without the option, no extra read.
    await client.job("job_rr").rerun();
    expect(runReads).toEqual(["run_2"]);
  });

  test("a run stopped mid-ingest is not done until ingest_status leaves pending", async () => {
    let reads = 0;
    server.use(
      http.post(`${API}/jobs/job_rr/rerun`, () =>
        HttpResponse.json(
          {
            job_id: "job_rr",
            status: "closed",
            latest_run: runBody("run_2", "pending", "pending"),
            retried_tasks: 3,
            inherited_tasks: 0,
          },
          { status: 202 },
        ),
      ),
      http.get(`${API}/jobs/job_rr/runs/run_2`, () => {
        reads += 1;
        // Stopped at once, but the API settles the rows and totals a poll later.
        return HttpResponse.json(runBody("run_2", "stopped", reads < 2 ? "pending" : "done"));
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    // The rerun path uses the default 2 s poll; drive the same wait directly with a short one.
    const resp = await client._postRerun("job_rr", {});
    const run = await client._waitForRunIngestRaw("job_rr", resp.latest_run.run_id, {
      pollInterval: 0.01,
    });
    expect(run.status).toBe("stopped");
    expect(run.ingest_status).toBe("done");
    expect(reads).toBe(2);
  });

  test("JobRef.waitForIngest on a stopped run with pending ingest keeps polling", async () => {
    let reads = 0;
    server.use(
      http.get(`${API}/jobs/job_stop_ingest`, () => {
        reads += 1;
        return HttpResponse.json({
          job_id: "job_stop_ingest",
          type: "regular",
          status: "closed",
          latest_run: {
            ...runBody("run_1", "stopped", reads < 2 ? "pending" : "done"),
            job_id: "job_stop_ingest",
          },
        });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const handle = await client.job("job_stop_ingest").waitForIngest({ pollInterval: 0.01 });
    expect(handle.data.latest_run?.ingest_status).toBe("done");
    expect(reads).toBe(2);
  });

  test("a replayed submit waits on the run it returned, then loads the job", async () => {
    const runReads: string[] = [];
    server.use(
      http.post(`${API}/jobs`, () =>
        HttpResponse.json(
          {
            job_id: "job_big",
            status: "closed",
            accepted_tasks: 10_000,
            latest_run: { ...runBody("run_1", "pending", "pending"), job_id: "job_big" },
          },
          { status: 202 },
        ),
      ),
      http.get(`${API}/jobs/job_big/runs/:runId`, ({ params }) => {
        runReads.push(String(params.runId));
        return HttpResponse.json({
          ...runBody(String(params.runId), "completed", "done"),
          job_id: "job_big",
        });
      }),
      http.get(`${API}/jobs/job_big`, () =>
        HttpResponse.json({
          job_id: "job_big",
          type: "regular",
          status: "closed",
          latest_run: { ...runBody("run_3", "running", "pending"), job_id: "job_big" },
        }),
      ),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const job = await client.submitRegular(["https://example.com"], undefined, {
      idempotencyKey: "replayed",
      waitForIngest: true,
    });
    expect(runReads).toEqual(["run_1"]);
    expect(job.jobId).toBe("job_big");
  });

  test("submitScheduled answers 201 with no run, so waitForIngest never polls", async () => {
    let jobReads = 0;
    server.use(
      http.post(`${API}/jobs`, () =>
        HttpResponse.json(
          { job_id: "job_sched", status: "closed", accepted_tasks: 1 },
          { status: 201 },
        ),
      ),
      http.get(`${API}/jobs/job_sched`, () => {
        jobReads += 1;
        return HttpResponse.json({ job_id: "job_sched", type: "scheduled", status: "closed" });
      }),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    const job = await client.submitScheduled(
      new At("2030-01-01T00:00:00", "UTC"),
      ["https://example.com"],
      undefined,
      { waitForIngest: true },
    );
    expect(job.jobId).toBe("job_sched");
    expect(jobReads).toBe(0);
  });
});

describe("content reads honour the request timeout", () => {
  test("getTaskContent and getTaskContentBytes abort a body that stalls after the headers", async () => {
    // A real socket: headers and a first chunk arrive, then the body never ends.
    const sockets = new Set<import("node:net").Socket>();
    const stalled = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.write("<html>");
    });
    stalled.on("connection", (socket) => sockets.add(socket));
    await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
    const { port } = stalled.address() as AddressInfo;
    try {
      const client = new ZenRowsBatchClient("API_KEY", {
        baseURL: `http://127.0.0.1:${port}/v1`,
        timeout: 0.2,
        retries: 0,
      });
      await expect(client.getTaskContent("job_stall", "t1")).rejects.toThrow(/timed out/);
      await expect(client.getTaskContentBytes("job_stall", "t1")).rejects.toThrow(/timed out/);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => stalled.close(resolve));
    }
  }, 5_000);
});

describe("types follow the wire shapes", () => {
  test("task, run and webhook event fields", () => {
    expectTypeOf<"expired">().toMatchTypeOf<TaskStatus>();
    expectTypeOf<TaskResult["created_at"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<TaskResult["updated_at"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<"scheduled">().toMatchTypeOf<NonNullable<Run["trigger"]>>();
    const event: WebhookEvent = {
      schema: "zenrows.webhook/v1",
      event_id: "evt_1",
      event_type: "run.failed",
      occurred_at: "2026-01-01T00:00:00Z",
      job_id: "j1",
      run_id: "r1",
      run_sequence: 1,
      failure_reason: "insufficient_credits",
    };
    expect(event.event_type).toBe("run.failed");
  });
});

describe("waiting on a paused run", () => {
  function pausedJob(jobId: string, counter: { reads: number }) {
    return http.get(`${API}/jobs/${jobId}`, () => {
      counter.reads += 1;
      return HttpResponse.json({
        job_id: jobId,
        type: "regular",
        status: "closed",
        latest_run: {
          run_id: "run_p",
          job_id: jobId,
          run_sequence: 1,
          status: "running",
          pause_state: "paused",
          stats: { total: 2, completed: 1, successful: 1, failed: 0 },
        },
      });
    });
  }

  test("stops at once with RunPausedError carrying the run", async () => {
    const counter = { reads: 0 };
    server.use(pausedJob("job_paused", counter));
    const client = new ZenRowsBatchClient("API_KEY");
    const error = await client
      .job("job_paused")
      .run.wait({ timeout: 5 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(RunPausedError);
    expect((error as RunPausedError).run.pause_state).toBe("paused");
    expect((error as RunPausedError).run.run_id).toBe("run_p");
    expect(counter.reads).toBe(1);
  });

  test("a specific run's wait stops on pause too", async () => {
    server.use(
      http.get(`${API}/jobs/job_paused2/runs/run_p`, () =>
        HttpResponse.json({
          run_id: "run_p",
          job_id: "job_paused2",
          run_sequence: 1,
          status: "pending",
          pause_state: "paused",
          stats: { total: 1, completed: 0, successful: 0, failed: 0 },
        }),
      ),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(client.run("job_paused2", "run_p").wait()).rejects.toBeInstanceOf(RunPausedError);
  });

  test("waitWhilePaused keeps polling until the timeout", async () => {
    const counter = { reads: 0 };
    server.use(pausedJob("job_paused3", counter));
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(
      client.waitForRun("job_paused3", {
        waitWhilePaused: true,
        timeout: 0.05,
        pollInterval: 0.01,
      }),
    ).rejects.toBeInstanceOf(WaiterTimeoutError);
    expect(counter.reads).toBeGreaterThan(1);
  });

  test("a paused run already in a target status resolves", async () => {
    server.use(
      http.get(`${API}/jobs/job_paused4`, () =>
        HttpResponse.json({
          job_id: "job_paused4",
          type: "regular",
          status: "closed",
          latest_run: {
            run_id: "run_p",
            job_id: "job_paused4",
            run_sequence: 1,
            status: "stopped",
            pause_state: "paused",
            stats: { total: 1, completed: 1, successful: 1, failed: 0 },
          },
        }),
      ),
    );
    const client = new ZenRowsBatchClient("API_KEY");
    await expect(client.waitForRun("job_paused4")).resolves.toMatchObject({ status: "stopped" });
  });
});
