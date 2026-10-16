import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ZenRowsBatchClient } from "../src/batch/client";
import { server } from "./_setup";

describe("downloadToDir / downloadToMemory / single-task download", () => {
  const client = new ZenRowsBatchClient("API_KEY");
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenrows-batch-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("downloadToDir writes one file per successful task, named by task_id by default", async () => {
    const count = await client.downloadToDir("job_download", undefined, dir);
    expect(count).toBe(2);
    const files = (await readdir(dir)).sort();
    expect(files).toEqual(["task_a", "task_b"]);
    expect(await readFile(join(dir, "task_a"), "utf-8")).toBe("body A");
  });

  test("downloadToDir can name files by external_id when requested", async () => {
    await client.downloadToDir("job_download", undefined, dir, { useExternalId: true });
    const files = (await readdir(dir)).sort();
    // task_b has no external_id, so it still falls back to task_id.
    expect(files).toEqual(["ext_a", "task_b"]);
  });

  test("downloadToDir honors a custom nameFn", async () => {
    await client.downloadToDir("job_download", undefined, dir, {
      nameFn: (task) => `${task.task_id}.html`,
    });
    const files = (await readdir(dir)).sort();
    expect(files).toEqual(["task_a.html", "task_b.html"]);
  });

  test("downloadToMemory returns every body as a DownloadedResult", async () => {
    const results = await client.downloadToMemory("job_download", undefined);
    expect(results).toHaveLength(2);
    const byTaskId = Object.fromEntries(results.map((r) => [r.taskId, r.body.toString("utf-8")]));
    expect(byTaskId.task_a).toBe("body A");
    expect(byTaskId.task_b).toBe("body B");
  });

  test("downloadTaskToFile / downloadTaskToMemory work on a single already-held TaskResult", async () => {
    const { results } = await client.getResults("job_download");
    const task = results[0];
    if (!task) throw new Error("fixture returned no results");
    const memory = await client.downloadTaskToMemory(task);
    expect(memory.toString("utf-8")).toBe("body A");

    const target = join(dir, "single.html");
    await client.downloadTaskToFile(task, target);
    expect(await readFile(target, "utf-8")).toBe("body A");
  });

  test("downloadTaskToMemory throws a clear error for a task with no result_url", async () => {
    await expect(
      client.downloadTaskToMemory({
        task_id: "no_url",
        run_id: "r",
        url: "https://x.com",
        status: "failed",
      }),
    ).rejects.toThrow(/no result_url/);
  });

  describe("rows without a result_url", () => {
    // An `expired` row (past the retention window) still matches `status=successful` but has
    // no result_url; a `failed` row has none either when the filter includes it.
    const rows = (extra: object[] = []) =>
      server.use(
        http.get("https://async.api.zenrows.com/v1/jobs/job_mixed/results", () =>
          HttpResponse.json({
            results: [
              {
                task_id: "task_a",
                run_id: "r",
                url: "https://example.com/a",
                status: "successful",
                result_url: "https://storage.example.test/body-a",
              },
              {
                task_id: "task_old",
                external_id: "ext_old",
                run_id: "r",
                url: "https://example.com/old",
                status: "expired",
              },
              {
                task_id: "task_bad",
                run_id: "r",
                url: "https://example.com/bad",
                status: "failed",
              },
              ...extra,
            ],
            next_cursor: null,
          }),
        ),
      );

    test("downloadToDir skips expired and failed rows and reports them to onSkip", async () => {
      rows();
      const skipped: unknown[] = [];
      const count = await client.downloadToDir("job_mixed", undefined, dir, {
        status: "all",
        onSkip: (row) => skipped.push(row),
      });
      expect(count).toBe(1);
      expect(skipped).toEqual([
        {
          taskId: "task_old",
          externalId: "ext_old",
          url: "https://example.com/old",
          status: "expired",
        },
        {
          taskId: "task_bad",
          externalId: undefined,
          url: "https://example.com/bad",
          status: "failed",
        },
      ]);
      expect(await readdir(dir)).toEqual(["task_a"]);
    });

    test("downloadToMemory skips them and reports them to onSkip", async () => {
      rows();
      const skipped: unknown[] = [];
      const results = await client.downloadToMemory("job_mixed", undefined, {
        status: "all",
        onSkip: (row) => skipped.push(row),
      });
      expect(results.map((r) => r.taskId)).toEqual(["task_a"]);
      expect(skipped).toEqual([
        {
          taskId: "task_old",
          externalId: "ext_old",
          url: "https://example.com/old",
          status: "expired",
        },
        {
          taskId: "task_bad",
          externalId: undefined,
          url: "https://example.com/bad",
          status: "failed",
        },
      ]);
    });

    test("onSkip is optional", async () => {
      rows();
      const results = await client.downloadToMemory("job_mixed", undefined, { status: "all" });
      expect(results.map((r) => r.taskId)).toEqual(["task_a"]);
    });

    test("a successful row with no result_url still fails the download", async () => {
      rows([
        { task_id: "task_odd", run_id: "r", url: "https://example.com/odd", status: "successful" },
      ]);
      const skipped: unknown[] = [];
      await expect(
        client.downloadToDir("job_mixed", undefined, dir, {
          status: "all",
          onSkip: (row) => skipped.push(row),
        }),
      ).rejects.toThrow(/task_odd has no result_url/);
      expect(skipped).toHaveLength(2);
      await expect(
        client.downloadToMemory("job_mixed", undefined, { status: "all" }),
      ).rejects.toThrow(/task_odd has no result_url/);
    });

    test("an unfinished row with no result_url still fails the download", async () => {
      rows([
        { task_id: "task_wip", run_id: "r", url: "https://example.com/wip", status: "processing" },
      ]);
      await expect(
        client.downloadToMemory("job_mixed", undefined, { status: "all" }),
      ).rejects.toThrow(/task_wip has no result_url/);
    });

    test("a single-task download of an expired row says why it has no body", async () => {
      await expect(
        client.downloadTaskToMemory({
          task_id: "task_old",
          run_id: "r",
          url: "https://example.com/old",
          status: "expired",
        }),
      ).rejects.toThrow(/retention window/);
    });
  });

  test("maxFiles counts only the rows it will fetch, and still caps them", async () => {
    server.use(
      http.get("https://async.api.zenrows.com/v1/jobs/job_cap/results", () =>
        HttpResponse.json({
          results: [
            { task_id: "x", run_id: "r", url: "https://example.com/x", status: "expired" },
            ...["a", "b"].map((id) => ({
              task_id: id,
              run_id: "r",
              url: `https://example.com/${id}`,
              status: "successful",
              result_url: `https://storage.example.test/body-${id}`,
            })),
          ],
          next_cursor: null,
        }),
      ),
    );
    await expect(client.downloadToDir("job_cap", undefined, dir, { maxFiles: 1 })).rejects.toThrow(
      "result count exceeds maxFiles (1)",
    );
    await expect(
      client.downloadToMemory("job_cap", undefined, { maxCount: 2 }),
    ).resolves.toHaveLength(2);
  });
});
