/**
 * 04: Cursor-free browsing with the async-generator scanners.
 *
 * `iterJobs` / `iterRuns` auto-paginate and yield handles whose data
 * is pre-loaded from the page (`get()` is instant), so you never touch
 * a `nextCursor`.
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/04_paginated_scanners.ts
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  // iterJobs / runs() return AsyncStreams of loaded handles — stream them
  // with `.forEach` (the callback may be async), `.data` is ready, no await.
  await client.iterJobs({ status: "closed" }).forEach(async (job) => {
    console.log(`job ${job.jobId} (${job.data.type})`);
    await job.runs().forEach((run) => {
      const { status, stats } = run.data;
      console.log(`  run ${run.runId} ${status}: ${stats.successful}/${stats.total}`);
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
