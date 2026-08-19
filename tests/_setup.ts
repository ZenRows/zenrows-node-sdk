import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

const handlers = [
  http.get("https://api.zenrows.com/v1/", () => {
    return HttpResponse.json({
      firstName: "John",
      lastName: "Maverick",
    });
  }),
  http.post("https://api.zenrows.com/v1/", () => {
    return new HttpResponse();
  }),
  http.post("https://async.api.zenrows.com/v1/jobs", () => {
    return HttpResponse.json({ job_id: "job_123", status: "open" }, { status: 201 });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs", () => {
    return HttpResponse.json({ jobs: [], next_cursor: null });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123", () => {
    return HttpResponse.json({ job_id: "job_123", status: "open" });
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_123/tasks", () => {
    return HttpResponse.json({ accepted_tasks: 1, job_status: "open" });
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_123/close", () => {
    return HttpResponse.json({ job_id: "job_123", status: "closed" });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/results", () => {
    return HttpResponse.json({ results: [], next_cursor: null });
  }),
  // `DELETE /jobs/{id}` is documented as 202 Accepted with an empty body (async delete).
  http.delete("https://async.api.zenrows.com/v1/jobs/job_123", () => {
    return new HttpResponse(null, { status: 202 });
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_123/stop", () => {
    return HttpResponse.json({ run_id: "run_1", job_id: "job_123", status: "stopped" });
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_123/rerun", () => {
    return HttpResponse.json(
      { job_id: "job_123", status: "open", latest_run: { run_id: "run_2" }, rerun_of: "run_1" },
      { status: 201 },
    );
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/runs", () => {
    return HttpResponse.json({ runs: [{ run_id: "run_1" }], next_cursor: null });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/runs/run_1", () => {
    return HttpResponse.json({ run_id: "run_1", job_id: "job_123", status: "completed" });
  }),
  http.delete("https://async.api.zenrows.com/v1/jobs/job_123/runs/run_1", () => {
    return new HttpResponse(null, { status: 202 });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/runs/run_1/results", () => {
    return HttpResponse.json({ results: [{ task_id: "task_1" }], next_cursor: null });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/tasks/task_1/content", () => {
    return HttpResponse.text("<html>latest run content</html>");
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/runs/run_1/tasks/task_1/content", () => {
    return HttpResponse.text("<html>run_1 content</html>");
  }),
  // Error fixtures — each job id encodes the failure it triggers, so tests can hit them by name.
  http.post("https://async.api.zenrows.com/v1/jobs/job_no_credit/tasks", () => {
    return HttpResponse.json(
      {
        type: "about:blank",
        title: "Payment Required",
        status: 402,
        detail: "No credit available",
      },
      { status: 402 },
    );
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_conflict/close", () => {
    return HttpResponse.json(
      { type: "about:blank", title: "Conflict", status: 409, detail: "Job is not open" },
      { status: 409 },
    );
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_unauthorized", () => {
    return HttpResponse.json(
      {
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        detail: "Missing / invalid API key",
      },
      { status: 401 },
    );
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_upstream_down", () => {
    return HttpResponse.json(
      {
        type: "about:blank",
        title: "Service Unavailable",
        status: 503,
        detail: "Transient upstream failure",
      },
      { status: 503 },
    );
  }),
  // Simulates an upstream failure mode that doesn't even return valid JSON on error.
  http.get("https://async.api.zenrows.com/v1/jobs/job_broken_upstream", () => {
    return new HttpResponse("<html>502 Bad Gateway</html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/tasks/task_failed/content", () => {
    return HttpResponse.json(
      { type: "about:blank", title: "Unprocessable Entity", status: 422, detail: "Task failed" },
      { status: 422 },
    );
  }),

  // ----- schedule -----
  http.put("https://async.api.zenrows.com/v1/jobs/job_sched/schedule", () => {
    return HttpResponse.json({ job_id: "job_sched", status: "closed", type: "scheduled" });
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_sched/schedule/state", () => {
    return HttpResponse.json({ job_id: "job_sched", status: "closed", schedule_state: "paused" });
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_123/pause", () => {
    return HttpResponse.json({ run_id: "run_1", job_id: "job_123", pause_state: "paused" });
  }),
  http.post("https://async.api.zenrows.com/v1/jobs/job_123/resume", () => {
    return HttpResponse.json({ run_id: "run_1", job_id: "job_123", pause_state: "active" });
  }),

  // ----- webhooks -----
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/webhook", () => {
    return HttpResponse.json({ url: "https://example.com/hook", signature: true });
  }),
  http.put("https://async.api.zenrows.com/v1/jobs/job_123/webhook", () => {
    return HttpResponse.json({ url: "https://example.com/hook2", signature: false });
  }),
  http.delete("https://async.api.zenrows.com/v1/jobs/job_123/webhook", () => {
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("https://async.api.zenrows.com/v1/webhook/test", () => {
    return HttpResponse.json({
      delivered: true,
      event_id: "evt_1",
      status_code: 200,
      elapsed_ms: 42,
    });
  }),

  // ----- HMAC key lifecycle -----
  http.get("https://async.api.zenrows.com/v1/hmac/keys", () => {
    return HttpResponse.json({
      active: { kid: "01AAAAAAAAAAAAAAAAAAAAAAAA", created_at: "2026-01-01T00:00:00Z" },
    });
  }),
  http.post("https://async.api.zenrows.com/v1/hmac/keys/rotate", () => {
    return HttpResponse.json({
      kid: "01BBBBBBBBBBBBBBBBBBBBBBBB",
      secret: "c2VjcmV0",
      created_at: "2026-01-02T00:00:00Z",
    });
  }),
  http.delete("https://async.api.zenrows.com/v1/hmac/keys/rotate", () => {
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("https://async.api.zenrows.com/v1/hmac/keys/rotate/finalize", () => {
    return HttpResponse.json({
      active_kid: "01BBBBBBBBBBBBBBBBBBBBBBBB",
      created_at: "2026-01-02T00:00:00Z",
    });
  }),

  // ----- CSV upload (job_inputs) -----
  http.post("https://async.api.zenrows.com/v1/job_inputs", () => {
    return HttpResponse.json({
      file_input_id: "file_123",
      upload: {
        method: "PUT",
        url: "https://storage.example.test/presigned-upload",
        headers: { "Content-Type": "text/csv" },
        expires_at: "2026-01-01T01:00:00Z",
      },
      expires_at: "2026-01-02T00:00:00Z",
    });
  }),
  http.put("https://storage.example.test/presigned-upload", () => {
    return new HttpResponse(null, { status: 200 });
  }),

  // ----- results export -----
  http.post("https://async.api.zenrows.com/v1/jobs/job_123/runs/run_1/exports", () => {
    return HttpResponse.json(
      {
        export_id: "01EXPORTAAAAAAAAAAAAAAAAAA",
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
        expires_at: "2026-01-01T12:00:00Z",
      },
      { status: 201 },
    );
  }),
  http.get(
    "https://async.api.zenrows.com/v1/jobs/job_123/runs/run_1/exports/01EXPORTAAAAAAAAAAAAAAAAAA",
    () => {
      return HttpResponse.json({
        export_id: "01EXPORTAAAAAAAAAAAAAAAAAA",
        status: "completed",
        download_url: "https://storage.example.test/export.zip",
        created_at: "2026-01-01T00:00:00Z",
        expires_at: "2026-01-01T12:00:00Z",
      });
    },
  ),
  http.get("https://storage.example.test/export.zip", () => {
    return new HttpResponse(new Blob([new Uint8Array([1, 2, 3, 4])]), { status: 200 });
  }),

  // ----- task history -----
  http.get("https://async.api.zenrows.com/v1/jobs/job_123/tasks/task_1/history", () => {
    return HttpResponse.json({
      events: [
        { started_at: "2026-01-01T00:00:00Z", ended_at: "2026-01-01T00:00:01Z", attempt: 1 },
      ],
    });
  }),

  // ----- retry: fails twice with 503, succeeds on the 3rd attempt -----
  http.get(
    "https://async.api.zenrows.com/v1/jobs/job_retry_then_ok",
    (() => {
      let calls = 0;
      return () => {
        calls += 1;
        if (calls < 3) {
          return HttpResponse.json(
            { type: "about:blank", title: "Service Unavailable", status: 503 },
            { status: 503 },
          );
        }
        return HttpResponse.json({ job_id: "job_retry_then_ok", status: "open" });
      };
    })(),
  ),
  // ----- retry: honors Retry-After -----
  http.get(
    "https://async.api.zenrows.com/v1/jobs/job_retry_after",
    (() => {
      let calls = 0;
      return () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { type: "about:blank", title: "Too Many Requests", status: 429 },
            { status: 429, headers: { "Retry-After": "0" } },
          );
        }
        return HttpResponse.json({ job_id: "job_retry_after", status: "open" });
      };
    })(),
  ),
  // ----- download: a job whose results carry real presigned result_urls -----
  http.get("https://async.api.zenrows.com/v1/jobs/job_download/results", () => {
    return HttpResponse.json({
      results: [
        {
          task_id: "task_a",
          external_id: "ext_a",
          run_id: "run_dl",
          url: "https://example.com/a",
          status: "successful",
          result_url: "https://storage.example.test/body-a",
        },
        {
          task_id: "task_b",
          run_id: "run_dl",
          url: "https://example.com/b",
          status: "successful",
          result_url: "https://storage.example.test/body-b",
        },
      ],
      next_cursor: null,
    });
  }),
  http.get("https://async.api.zenrows.com/v1/jobs/job_download/runs/run_dl/results", () => {
    return HttpResponse.json({
      results: [
        {
          task_id: "task_a",
          external_id: "ext_a",
          run_id: "run_dl",
          url: "https://example.com/a",
          status: "successful",
          result_url: "https://storage.example.test/body-a",
        },
        {
          task_id: "task_b",
          run_id: "run_dl",
          url: "https://example.com/b",
          status: "successful",
          result_url: "https://storage.example.test/body-b",
        },
      ],
      next_cursor: null,
    });
  }),
  http.get(
    "https://storage.example.test/body-a",
    () => new HttpResponse("body A", { status: 200 }),
  ),
  http.get(
    "https://storage.example.test/body-b",
    () => new HttpResponse("body B", { status: 200 }),
  ),

  // ----- job whose ingest is pending on the 1st poll, done on the 2nd -----
  http.get(
    "https://async.api.zenrows.com/v1/jobs/job_ingest_pending",
    (() => {
      let calls = 0;
      return () => {
        calls += 1;
        return HttpResponse.json({
          job_id: "job_ingest_pending",
          status: "open",
          latest_run: {
            run_id: "run_ip",
            job_id: "job_ingest_pending",
            status: "running",
            ingest_status: calls < 2 ? "pending" : "done",
          },
        });
      };
    })(),
  ),
  http.get("https://async.api.zenrows.com/v1/jobs/job_no_run", () => {
    return HttpResponse.json({ job_id: "job_no_run", status: "closed" });
  }),

  // ----- retry: a network-level failure (not an HTTP status) on a GET, then success -----
  http.get(
    "https://async.api.zenrows.com/v1/jobs/job_network_blip",
    (() => {
      let calls = 0;
      return () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.error();
        }
        return HttpResponse.json({ job_id: "job_network_blip", status: "open" });
      };
    })(),
  ),

  // ----- retry: POST without an Idempotency-Key is never retried on 503 -----
  http.post(
    "https://async.api.zenrows.com/v1/jobs/job_no_retry_post/tasks",
    (() => {
      let calls = 0;
      return () => {
        calls += 1;
        return HttpResponse.json(
          { type: "about:blank", title: "Service Unavailable", status: 503 },
          { status: 503 },
        );
      };
    })(),
  ),
];

export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
