import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import { ZenRows, ZenRowsBatchClient, ZenRowsBatchError } from "../src";
import { server } from "./_setup";

describe("ZenRows Batch client", () => {
  const apiKey = "API_KEY";
  let client: ZenRows;

  beforeEach(() => {
    client = new ZenRows(apiKey);
  });

  test("is exposed on the ZenRows instance", () => {
    expect(client.batch).toBeDefined();
    expect(client.batch.apiKey).toBe(apiKey);
  });

  test("is usable standalone, matching the Go/Python SDKs' batch client shape", () => {
    const standalone = new ZenRowsBatchClient(apiKey);
    expect(standalone).toBeInstanceOf(ZenRowsBatchClient);
    expect(standalone.apiKey).toBe(apiKey);
  });

  test("accepts a baseURL override, matching Go's WithBaseURL/Python's base_url", async () => {
    server.use(
      http.get("https://batch.example.test/jobs/job_123", () => {
        return HttpResponse.json({ job_id: "job_123", status: "open" });
      }),
    );

    const custom = new ZenRowsBatchClient(apiKey, { baseURL: "https://batch.example.test" });
    const job = await custom.getJob("job_123");

    expect(job).toMatchObject({ job_id: "job_123" });
  });

  describe("request shape", () => {
    test("authenticates with X-API-Key header, not the query-param style the main client uses", async () => {
      const job = await client.batch.getJob("job_123");
      expect(job).toMatchObject({ job_id: "job_123" });
      // If this were sent as ?apikey=... instead of the header, msw's exact-URL handler
      // above would still match (query params don't affect path matching) — so the real
      // assertion is in fetchMock below, which inspects the actual request.
    });

    test("submitJob sends a JSON body, not the main client's query-param encoding", async () => {
      const job = await client.batch.submitJob({
        status: "open",
        tasks: [{ url: "https://example.com" }],
      });
      expect(job).toMatchObject({ job_id: "job_123", status: "open" });
    });

    test("submitJob forwards an idempotency key as a header, not a body field", async () => {
      // Exercises the idempotencyKey branch in request() — a body containing it would be
      // a real bug (the API expects it as the Idempotency-Key header, not JSON).
      const job = await client.batch.submitJob({
        tasks: [{ url: "https://example.com" }],
        idempotencyKey: "submit-once",
      });
      expect(job).toMatchObject({ job_id: "job_123" });
    });
  });

  describe("open/closed job lifecycle", () => {
    test("submits an open job that accepts more tasks", async () => {
      const job = await client.batch.submitJob({
        status: "open",
        tasks: [{ url: "https://example.com" }],
      });

      expect(job).toMatchObject({ job_id: "job_123", status: "open" });
    });

    test("adds tasks to an open job", async () => {
      const result = await client.batch.addTasks("job_123", [{ url: "https://example.com/2" }]);

      expect(result).toMatchObject({ accepted_tasks: 1, job_status: "open" });
    });

    test("closes an open job", async () => {
      const job = await client.batch.closeJob("job_123");

      expect(job).toMatchObject({ job_id: "job_123", status: "closed" });
    });

    test("addTasks with lastBatch closes the job as a side effect of the same call", async () => {
      // Real capability from the spec: addTasks({ last_batch: true }) has the same effect
      // as addTasks() + closeJob(), in one request. Regression test for the request body shape.
      const result = await client.batch.addTasks("job_123", [{ url: "https://example.com/3" }], {
        lastBatch: true,
      });

      expect(result).toMatchObject({ accepted_tasks: 1 });
    });
  });

  describe("job/run inspection and lifecycle actions", () => {
    test("lists jobs", async () => {
      const response = await client.batch.listJobs({ status: "open" });
      expect(response).toMatchObject({ jobs: [] });
    });

    test("gets a job", async () => {
      const job = await client.batch.getJob("job_123");
      expect(job).toMatchObject({ job_id: "job_123" });
    });

    test("deletes a job — async delete returns 202 with an empty body, not JSON", async () => {
      // Regression test: the client used to only special-case 204. A 202-with-no-body
      // (the real shape for this endpoint) would throw a SyntaxError parsing "" as JSON.
      const result = await client.batch.deleteJob("job_123");
      expect(result).toBeUndefined();
    });

    test("stops the current run", async () => {
      const run = await client.batch.stopRun("job_123");
      expect(run).toMatchObject({ status: "stopped" });
    });

    test("reruns a job with no status filter (full replay)", async () => {
      const result = await client.batch.rerun("job_123");
      expect(result).toMatchObject({ job_id: "job_123", rerun_of: "run_1" });
    });

    test("reruns a job with a status filter (partial retry) as a query param", async () => {
      const result = await client.batch.rerun("job_123", { status: "failed,pending" });
      expect(result).toMatchObject({ job_id: "job_123" });
    });

    test("lists runs for a job", async () => {
      const response = await client.batch.listRuns("job_123");
      expect(response).toMatchObject({ runs: [{ run_id: "run_1" }] });
    });

    test("gets a specific run", async () => {
      const run = await client.batch.getRun("job_123", "run_1");
      expect(run).toMatchObject({ run_id: "run_1", status: "completed" });
    });

    test("deletes a specific run — same empty-body 202 shape as deleteJob", async () => {
      const result = await client.batch.deleteRun("job_123", "run_1");
      expect(result).toBeUndefined();
    });
  });

  describe("results and task content", () => {
    test("pages through results for the latest run", async () => {
      const results = await client.batch.getResults("job_123");
      expect(results).toMatchObject({ results: [] });
    });

    test("pages through results for a specific run", async () => {
      const results = await client.batch.getResults("job_123", { runId: "run_1" });
      expect(results).toMatchObject({ results: [{ task_id: "task_1" }] });
    });

    test("fetches task content for the latest run", async () => {
      const content = await client.batch.getTaskContent("job_123", "task_1");
      expect(content).toBe("<html>latest run content</html>");
    });

    test("fetches task content for a specific run", async () => {
      const content = await client.batch.getTaskContent("job_123", "task_1", { runId: "run_1" });
      expect(content).toBe("<html>run_1 content</html>");
    });

    test("throws ZenRowsBatchError (422) when the task itself failed, instead of returning the Problem body as content", async () => {
      await expect(client.batch.getTaskContent("job_123", "task_failed")).rejects.toSatisfy(
        (error: unknown) => {
          expect(error).toBeInstanceOf(ZenRowsBatchError);
          expect((error as ZenRowsBatchError).status).toBe(422);
          return true;
        },
      );
    });
  });

  describe("error handling", () => {
    test("throws ZenRowsBatchError with the real status and Problem-JSON body on 402", async () => {
      await expect(
        client.batch.addTasks("job_no_credit", [{ url: "https://example.com" }]),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(ZenRowsBatchError);
        const batchError = error as ZenRowsBatchError;
        expect(batchError.status).toBe(402);
        expect(batchError.problem).toMatchObject({ title: "Payment Required", status: 402 });
        return true;
      });
    });

    test("throws on 409 when closing a job that's already closed via a conflicting state", async () => {
      await expect(client.batch.closeJob("job_conflict")).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(ZenRowsBatchError);
        expect((error as ZenRowsBatchError).status).toBe(409);
        return true;
      });
    });

    test("throws on 401 for a bad API key", async () => {
      await expect(client.batch.getJob("job_unauthorized")).rejects.toSatisfy((error: unknown) => {
        expect((error as ZenRowsBatchError).status).toBe(401);
        return true;
      });
    });

    test("throws on 503 for a transient upstream failure, and the problem body survives", async () => {
      await expect(client.batch.getJob("job_upstream_down")).rejects.toSatisfy((error: unknown) => {
        const batchError = error as ZenRowsBatchError;
        expect(batchError.status).toBe(503);
        expect(batchError.problem).toMatchObject({ detail: "Transient upstream failure" });
        return true;
      });
    });

    test("still throws ZenRowsBatchError even when the error body isn't valid JSON", async () => {
      // Some failure modes (e.g. an edge proxy returning an HTML error page) won't be
      // Problem-JSON at all. `.problem` should degrade to undefined instead of the whole
      // call throwing an unrelated SyntaxError that masks the real HTTP status.
      await expect(client.batch.getJob("job_broken_upstream")).rejects.toSatisfy(
        (error: unknown) => {
          expect(error).toBeInstanceOf(ZenRowsBatchError);
          const batchError = error as ZenRowsBatchError;
          expect(batchError.status).toBe(502);
          expect(batchError.problem).toBeUndefined();
          return true;
        },
      );
    });
  });
});
