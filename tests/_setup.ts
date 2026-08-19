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
