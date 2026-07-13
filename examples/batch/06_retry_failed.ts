/**
 * 06: Retry only the failed tasks.
 *
 * After a run finishes with some failures, `retryFailed()` starts a
 * new run that re-executes only the failed tasks — successes are
 * inherited verbatim, so you don't pay to re-scrape them. Pass
 * `includePending: true` to also pick up tasks that never started.
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/06_retry_failed.ts <jobId>
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const [jobId] = process.argv.slice(2);
  if (!jobId) throw new Error("usage: 06_retry_failed.ts <jobId>");

  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  const run = await client.job(jobId).retryFailed(); // no preceding GET
  console.log(`started retry run ${run.runId}`);

  const done = await run.wait(); // loaded RunHandle
  const s = done.data.stats;
  console.log(`retry complete: ${s.successful}/${s.total} successful`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
