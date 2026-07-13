import { describe, expect, test } from "vitest";
import { camelize, decamelize } from "../../src/batch/case";

describe("case mapping", () => {
  test("camelize converts nested snake_case keys", () => {
    const wire = {
      job_id: "j1",
      latest_run: { run_id: "r1", run_sequence: 1, stats: { failure_reasons: { auth_failed: 2 } } },
      results: [{ task_id: "t1", external_id: "e1", result_url: null }],
    };
    expect(camelize(wire)).toEqual({
      jobId: "j1",
      latestRun: { runId: "r1", runSequence: 1, stats: { failureReasons: { auth_failed: 2 } } },
      results: [{ taskId: "t1", externalId: "e1", resultUrl: null }],
    });
  });

  test("camelize preserves opaque-map value keys", () => {
    const wire = {
      zenrows_params: { js_render: "true", premium_proxy: "true" },
      metadata: { order_ref: "abc" },
      upload: { headers: { "Content-Type": "text/csv" } },
    };
    expect(camelize(wire)).toEqual({
      zenrowsParams: { js_render: "true", premium_proxy: "true" },
      metadata: { order_ref: "abc" },
      upload: { headers: { "Content-Type": "text/csv" } },
    });
  });

  test("decamelize is the inverse, preserving opaque maps", () => {
    const camel = {
      externalId: "e1",
      zenrowsParams: { js_render: "true" },
      metadata: { order_ref: "abc" },
    };
    expect(decamelize(camel)).toEqual({
      external_id: "e1",
      zenrows_params: { js_render: "true" },
      metadata: { order_ref: "abc" },
    });
  });

  test("roundtrips arrays and scalars", () => {
    const camel = { tasks: [{ url: "https://a", externalId: "x" }], lastBatch: true };
    expect(camelize(decamelize(camel))).toEqual(camel);
  });
});
