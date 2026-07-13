import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import {
  BatchApiError,
  type SubmitRegularParams,
  type TaskResult,
  ZenRowsBatchClient,
} from "../../src/batch";
import { server } from "../_setup";

const BASE = "https://async.api.zenrows.com/v1";
const API_KEY = "zr_test";

let client: ZenRowsBatchClient;
beforeEach(() => {
  client = new ZenRowsBatchClient(API_KEY);
});

function run(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "run_1",
    job_id: "job_1",
    run_sequence: 1,
    status: "running",
    stats: { total: 2, completed: 0, successful: 0, failed: 0 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("submitRegular", () => {
  test("sends a decamelized body and returns a camelCase handle", async () => {
    let received: Record<string, unknown> | undefined;
    let auth: string | null = null;
    server.use(
      http.post(`${BASE}/jobs`, async ({ request }) => {
        auth = request.headers.get("X-API-Key");
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { job_id: "job_1", status: "closed", accepted_tasks: 2, latest_run: run() },
          { status: 201 },
        );
      }),
    );

    const job = await client.submitRegular({
      urls: [{ url: "https://a", externalId: "ord-1" }, "https://b"],
      zenrowsParams: { js_render: "true", premium_proxy: "true" },
    });

    expect(auth).toBe(API_KEY);
    expect(received).toEqual({
      type: "regular",
      status: "closed",
      zenrows_params: { js_render: "true", premium_proxy: "true" },
      tasks: [{ url: "https://a", external_id: "ord-1" }, { url: "https://b" }],
    });
    expect(job.jobId).toBe("job_1");
    expect(job.submitResponse?.status).toBe("closed");
    expect(job.submitResponse?.acceptedTasks).toBe(2);
    expect(job.submitResponse?.latestRun?.runId).toBe("run_1");
  });

  test("the type forbids both urls and fileInputId; runtime guards untyped callers", async () => {
    // @ts-expect-error urls and fileInputId are mutually exclusive
    const both: SubmitRegularParams = { urls: ["https://a"], fileInputId: "fi_1" };
    await expect(client.submitRegular(both)).rejects.toThrow(/not both/);
  });

  test("rejects a closed job with no source", async () => {
    // @ts-expect-error a source is required
    await expect(client.submitRegular({})).rejects.toThrow(/require `urls` or `fileInputId`/);
  });
});

describe("error mapping", () => {
  test("maps RFC 7807 problem+json to BatchApiError.code", async () => {
    server.use(
      http.get(`${BASE}/jobs/missing`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Not Found", status: 404, code: "not_found" },
          { status: 404, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await expect(client.getJob("missing")).rejects.toMatchObject({
      name: "BatchApiError",
      code: "not_found",
      statusCode: 404,
    });
    await expect(client.getJob("missing")).rejects.toBeInstanceOf(BatchApiError);
  });
});

describe("iterResults", () => {
  test("auto-paginates across cursors, camelCasing rows", async () => {
    server.use(
      http.get(`${BASE}/jobs/job_1/results`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) {
          return HttpResponse.json({
            results: [
              {
                task_id: "t1",
                run_id: "run_1",
                url: "https://a",
                status: "successful",
                result_url: "https://dl/1",
              },
            ],
            next_cursor: "c2",
          });
        }
        return HttpResponse.json({
          results: [
            {
              task_id: "t2",
              run_id: "run_1",
              url: "https://b",
              status: "successful",
              result_url: "https://dl/2",
            },
          ],
          next_cursor: null,
        });
      }),
    );
    const rows: TaskResult[] = [];
    for await (const row of client.iterResults("job_1")) rows.push(row);
    expect(rows.map((r) => r.taskId)).toEqual(["t1", "t2"]);
    expect(rows[0].resultUrl).toBe("https://dl/1");
  });
});

describe("waitForRun", () => {
  test("polls the job until the latest run is terminal", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/jobs/job_1`, () => {
        calls += 1;
        const status = calls >= 2 ? "completed" : "running";
        const stats = {
          total: 2,
          completed: calls >= 2 ? 2 : 0,
          successful: calls >= 2 ? 2 : 0,
          failed: 0,
        };
        return HttpResponse.json({
          job_id: "job_1",
          type: "regular",
          status: "closed",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          latest_run: run({ status, stats }),
        });
      }),
    );
    const result = await client.waitForRun("job_1", { pollInterval: 0.01, maxPollInterval: 0.01 });
    expect(result.status).toBe("completed");
    expect(result.stats.successful).toBe(2);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe("retryFailed", () => {
  test("issues a rerun with status=failed and returns a RunHandle", async () => {
    let query: string | null = null;
    server.use(
      http.post(`${BASE}/jobs/job_1/rerun`, ({ request }) => {
        query = new URL(request.url).searchParams.get("status");
        return HttpResponse.json(
          {
            job_id: "job_1",
            status: "closed",
            latest_run: run({ run_id: "run_2", run_sequence: 2 }),
            retried_tasks: 1,
            inherited_tasks: 1,
          },
          { status: 201 },
        );
      }),
    );
    const runHandle = await client.job("job_1").retryFailed();
    expect(query).toBe("failed");
    expect(runHandle.runId).toBe("run_2");
  });
});

describe("externalId validation (hard, no coercion)", () => {
  test("rejects a task externalId with illegal characters before any request", async () => {
    let hit = false;
    server.use(
      http.post(`${BASE}/jobs`, () => {
        hit = true;
        return HttpResponse.json(
          { job_id: "x", status: "closed", accepted_tasks: 0 },
          { status: 201 },
        );
      }),
    );
    await expect(
      client.submitRegular({ urls: [{ url: "https://a", externalId: "bad id!" }] }),
    ).rejects.toThrow(/task externalId .* is invalid/);
    expect(hit).toBe(false); // failed fast, no network
  });

  test("rejects a job-level externalId over 128 chars", async () => {
    await expect(
      client.submitRegular({ urls: ["https://a"], externalId: "x".repeat(129) }),
    ).rejects.toThrow(/exceeds 128 characters/);
  });

  test("rejects illegal externalId on addTasks too", async () => {
    await expect(
      client.job("j1").addTasks({ tasks: [{ url: "https://a", externalId: "no spaces" }] }),
    ).rejects.toThrow(/invalid/);
  });

  test("accepts a valid externalId (letters, digits, . _ -)", async () => {
    server.use(
      http.post(`${BASE}/jobs`, () =>
        HttpResponse.json({ job_id: "ok", status: "closed", accepted_tasks: 1 }, { status: 201 }),
      ),
    );
    const job = await client.submitRegular({
      urls: [{ url: "https://a", externalId: "order_1.2-3" }],
    });
    expect(job.jobId).toBe("ok");
  });
});

describe("estimateCost (client method, offline, async)", () => {
  test("estimates a job body with no network call", async () => {
    const est = await client.estimateCost({
      type: "regular",
      status: "closed",
      zenrowsParams: { js_render: "true" },
      tasks: [{ url: "https://a" }, { url: "https://b" }],
    });
    expect(String(est)).toBe("10 credits (2 tasks)");
    expect(est.exact).toBe(true);
    expect(est.min).toBe(10);
  });
});

describe("per-task download", () => {
  test("downloadTaskToMemory fetches one run task's body", async () => {
    server.use(
      http.get(
        `${BASE}/jobs/j/runs/r/tasks/t1/content`,
        () =>
          new HttpResponse("<html>hi</html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    const task = {
      taskId: "t1",
      runId: "r",
      url: "https://a",
      status: "successful",
      externalId: "e1",
    } as TaskResult;
    const dl = await client.run("j", "r").downloadTaskToMemory(task);
    expect(dl.taskId).toBe("t1");
    expect(dl.externalId).toBe("e1");
    expect(dl.contentType).toBe("text/html");
    expect(new TextDecoder().decode(dl.body)).toContain("hi");
  });

  test("downloadTaskToDir coerces an unsafe externalId into a safe filename", async () => {
    server.use(
      http.get(
        `${BASE}/jobs/j/runs/r/tasks/t1/content`,
        () => new HttpResponse("x", { status: 200, headers: { "Content-Type": "text/html" } }),
      ),
    );
    const dir = await mkdtemp(join(tmpdir(), "zr-"));
    try {
      const task = {
        taskId: "t1",
        runId: "r",
        url: "https://a",
        status: "successful",
        externalId: "a b/c", // space + slash — must be sanitized when written
        type: "html",
      } as TaskResult;
      const path = await client.run("j", "r").downloadTaskToDir(task, dir, { useExternalId: true });
      expect(await readdir(dir)).toEqual(["a_b_c.html"]);
      expect(path.endsWith("a_b_c.html")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("job.run vs job.schedule (the two pauses)", () => {
  test("job.run.pause hits the run-level /pause endpoint", async () => {
    let path: string | undefined;
    server.use(
      http.post(`${BASE}/jobs/job_1/pause`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(run({ status: "running", pause_state: "paused" }));
      }),
    );
    const handle = await client.job("job_1").run.pause();
    expect(path).toBe("/v1/jobs/job_1/pause");
    expect(handle.runId).toBe("run_1");
    expect(handle.data.status).toBe("running");
  });

  test("job.run.resume hits /resume", async () => {
    let path: string | undefined;
    server.use(
      http.post(`${BASE}/jobs/job_1/resume`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(run({ status: "running" }));
      }),
    );
    await client.job("job_1").run.resume();
    expect(path).toBe("/v1/jobs/job_1/resume");
  });

  test("job.schedule.pause hits the schedule-state endpoint with the right body", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/jobs/job_1/schedule/state`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          job_id: "job_1",
          type: "scheduled",
          status: "closed",
          schedule_state: "paused",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        });
      }),
    );
    const handle = await client.job("job_1").schedule.pause();
    expect(body).toEqual({ schedule_state: "paused" });
    expect(handle.data.scheduleState).toBe("paused");
  });
});

describe("uploadCsv", () => {
  test("allocates a slot then PUTs the body to the presigned URL", async () => {
    let putBody: string | undefined;
    server.use(
      http.post(`${BASE}/job_inputs`, async ({ request }) => {
        const body = (await request.json()) as { csv?: { fields?: Record<string, unknown> } };
        expect(body.csv?.fields).toEqual({ url: "Page URL", external_id: "Ref" });
        return HttpResponse.json({
          file_input_id: "fi_9",
          upload: {
            method: "PUT",
            url: "https://s3.example.com/put",
            headers: { "Content-Type": "text/csv" },
          },
          expires_at: "2026-01-02T00:00:00Z",
        });
      }),
      http.put("https://s3.example.com/put", async ({ request }) => {
        putBody = await request.text();
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const id = await client.uploadCsv(Buffer.from("url,ref\nhttps://a,1\n"), {
      fields: { url: "Page URL", externalId: "Ref" },
      header: true,
    });
    expect(id).toBe("fi_9");
    expect(putBody).toContain("https://a");
  });
});
