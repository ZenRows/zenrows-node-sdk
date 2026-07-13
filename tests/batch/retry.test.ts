import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { BatchApiError, ZenRowsBatchClient } from "../../src/batch";
import { server } from "../_setup";

const BASE = "https://async.api.zenrows.com/v1";

function jobBody() {
  return {
    job_id: "j1",
    type: "regular",
    status: "closed",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("transport retries", () => {
  test("retries an idempotent GET through transient 503s", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/jobs/j1`, () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json(jobBody());
      }),
    );
    const client = new ZenRowsBatchClient("k", { retries: 3 });
    const job = await client.getJob("j1");
    expect(calls).toBe(3);
    expect(job.jobId).toBe("j1");
  });

  test("does NOT retry a non-idempotent POST without an idempotency key", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/jobs/j1/tasks`, () => {
        calls += 1;
        return HttpResponse.json(
          { code: "unavailable", title: "Unavailable", status: 503 },
          {
            status: 503,
            headers: { "Content-Type": "application/problem+json" },
          },
        );
      }),
    );
    const client = new ZenRowsBatchClient("k", { retries: 3 });
    await expect(
      client.job("j1").addTasks({ tasks: [{ url: "https://a" }] }),
    ).rejects.toBeInstanceOf(BatchApiError);
    expect(calls).toBe(1);
  });

  test("retries a POST that carries an idempotency key", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/jobs`, () => {
        calls += 1;
        if (calls < 2) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json(
          { job_id: "j1", status: "closed", accepted_tasks: 1 },
          { status: 201 },
        );
      }),
    );
    const client = new ZenRowsBatchClient("k", { retries: 3 });
    const job = await client.submitJob(
      { type: "regular", status: "closed", tasks: [{ url: "https://a" }] },
      { idempotencyKey: "idem-1" },
    );
    expect(calls).toBe(2);
    expect(job.jobId).toBe("j1");
  });

  test("gives up after `retries` and throws the final error", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/jobs/j1`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const client = new ZenRowsBatchClient("k", { retries: 2 });
    await expect(client.getJob("j1")).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  test("retries: 0 disables retrying", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/jobs/j1`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const client = new ZenRowsBatchClient("k", { retries: 0 });
    await expect(client.getJob("j1")).rejects.toBeInstanceOf(BatchApiError);
    expect(calls).toBe(1);
  });
});
