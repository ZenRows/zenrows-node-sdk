/**
 * 01: Submit → wait → iterate results.
 *
 * The canonical end-to-end flow. `submitRegular` accepts bare URL
 * strings or task objects with per-task `externalId` / `metadata` /
 * `zenrowsParams`. The returned `JobHandle` knows its client, so
 * `job.wait()` returns a `RunHandle` you can iterate straight away.
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/01_submit_and_wait.ts
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  const job = await client.submitRegular({
    urls: [
      { url: "https://example.com/a", externalId: "order-1" },
      { url: "https://example.com/b", externalId: "order-2" },
      { url: "https://example.com/c", externalId: "order-3" },
    ],
    zenrowsParams: { js_render: "true", premium_proxy: "true" },
  });
  console.log(`submitted ${job.jobId} (${job.submitResponse?.acceptedTasks} tasks)`);

  // Block until the run is terminal (default target:
  // completed | stopped | deleted). Jittered exponential backoff.
  // `wait()` returns a loaded RunHandle — `.data` is ready, no await.
  const run = await job.run.wait({ timeout: 600 });
  const { status, stats } = run.data;
  console.log(`run ${run.runId} ${status}: ${stats.successful}/${stats.total} successful`);

  // `results()` is an AsyncStream: streaming `.forEach` (also `for await`).
  await run.results({ status: "successful" }).forEach((row) => {
    console.log(`  ${row.externalId ?? row.taskId} -> ${row.resultUrl}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
