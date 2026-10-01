import { http, HttpResponse } from "msw";
import { describe, expect, expectTypeOf, test } from "vitest";
import { type ListJobsOptions, ZenRowsBatchClient } from "../src/batch/client";
import type { JobStatus, Run, RunStatus, TaskResult, TaskStatus } from "../src/batch/types";
import { server } from "./_setup";

const BASE = "https://async.api.zenrows.com/v1";

describe("server-extensible enums", () => {
  test("response fields list the known values and still accept unknown ones", () => {
    expectTypeOf<"failed">().toMatchTypeOf<Run["status"]>();
    expectTypeOf<"archived">().toMatchTypeOf<Run["status"]>();
    expectTypeOf<"a_reason_added_later">().toMatchTypeOf<NonNullable<Run["failure_reason"]>>();
    expectTypeOf<"queued">().toMatchTypeOf<TaskResult["status"]>();
  });

  test("named types stay closed so they keep working as request input", () => {
    expectTypeOf<"archived">().not.toMatchTypeOf<RunStatus>();
    expectTypeOf<"queued">().not.toMatchTypeOf<TaskStatus>();
    const status: JobStatus = "open";
    expectTypeOf<{ status: typeof status }>().toMatchTypeOf<ListJobsOptions>();
  });

  test("parses a run with an unknown failure_reason and status without throwing", async () => {
    server.use(
      http.get(`${BASE}/jobs/job_x/runs/run_1`, () =>
        HttpResponse.json({
          run_id: "run_1",
          job_id: "job_x",
          run_sequence: 1,
          status: "archived",
          stats: { total: 1, completed: 0, successful: 0, failed: 0 },
          failure_reason: "a_reason_added_later",
        }),
      ),
    );
    const run = await new ZenRowsBatchClient("API_KEY").getRun("job_x", "run_1");
    expect(run.data.failure_reason).toBe("a_reason_added_later");
    expect(run.status).toBe("archived");
  });
});
