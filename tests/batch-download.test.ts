import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ZenRowsBatchClient } from "../src/batch/client";
import "./_setup";

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
});
