import { http, HttpResponse } from "msw";
import { describe, expect, expectTypeOf, test } from "vitest";
import { type ListJobsOptions, ZenRowsBatchClient } from "../src/batch/client";
import { ZenRowsBatchError } from "../src/batch/errors";
import type {
  JobStatus,
  Run,
  RunFailureReason,
  RunStatus,
  TaskResult,
  TaskStatus,
} from "../src/batch/types";
import { server } from "./_setup";

const BASE = "https://async.api.zenrows.com/v1";

function failedRun(failure_reason: string, failure_detail: string | null): Run {
  return {
    run_id: "run_1",
    job_id: "job_cap",
    run_sequence: 1,
    status: "failed",
    stats: { total: 1, completed: 0, successful: 0, failed: 0 },
    failure_reason,
    failure_detail,
  };
}

describe("server-extensible enums", () => {
  test("response fields list the known values and still accept unknown ones", () => {
    expectTypeOf<"api_key_cap_reached">().toMatchTypeOf<RunFailureReason>();
    expectTypeOf<"a_reason_added_later">().toMatchTypeOf<NonNullable<Run["failure_reason"]>>();
    expectTypeOf<"archived">().toMatchTypeOf<Run["status"]>();
    expectTypeOf<"processing">().toMatchTypeOf<TaskStatus>();
    expectTypeOf<"queued">().toMatchTypeOf<TaskResult["status"]>();
    expectTypeOf<Run["failure_detail"]>().toEqualTypeOf<string | null | undefined>();
  });

  test("named types stay closed so they keep working as request input", () => {
    expectTypeOf<"archived">().not.toMatchTypeOf<RunStatus>();
    expectTypeOf<"a_reason_added_later">().not.toMatchTypeOf<RunFailureReason>();
    const status: JobStatus = "open";
    expectTypeOf<{ status: typeof status }>().toMatchTypeOf<ListJobsOptions>();
  });

  test("parses a run failed with api_key_cap_reached and its detail", async () => {
    const detail =
      "This API key reached its daily cap of 1000 credits; it resets at 2026-10-01T00:00:00Z.";
    server.use(
      http.get(`${BASE}/jobs/job_cap/runs/run_1`, () =>
        HttpResponse.json(failedRun("api_key_cap_reached", detail)),
      ),
    );
    const run = await new ZenRowsBatchClient("API_KEY").getRun("job_cap", "run_1");
    expect(run.data.failure_reason).toBe("api_key_cap_reached");
    expect(run.data.failure_detail).toBe(detail);
  });

  test("parses a run with an unknown failure_reason and status without throwing", async () => {
    server.use(
      http.get(`${BASE}/jobs/job_cap/runs/run_1`, () =>
        HttpResponse.json({ ...failedRun("a_reason_added_later", null), status: "archived" }),
      ),
    );
    const run = await new ZenRowsBatchClient("API_KEY").getRun("job_cap", "run_1");
    expect(run.data.failure_reason).toBe("a_reason_added_later");
    expect(run.status).toBe("archived");
    expect(run.data.failure_detail).toBeNull();
  });

  test("a 402 api_key_cap_reached on rerun exposes code and detail", async () => {
    const detail =
      "This API key reached its monthly cap of 50000 credits; it resets at 2026-11-01T00:00:00Z.";
    server.use(
      http.post(`${BASE}/jobs/job_cap/rerun`, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Payment Required",
            status: 402,
            code: "api_key_cap_reached",
            detail,
          },
          { status: 402, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await expect(new ZenRowsBatchClient("API_KEY")._postRerun("job_cap")).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(ZenRowsBatchError);
        const err = error as ZenRowsBatchError;
        expect(err.status).toBe(402);
        expect(err.code).toBe("api_key_cap_reached");
        expect(err.problem?.detail).toBe(detail);
        return true;
      },
    );
  });
});
