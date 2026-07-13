/**
 * 10: Act on an id without a GET.
 *
 * Already have a job or run id (from a webhook, a queue, your own DB)?
 * `client.job(id)` / `client.run(id, runId)` mint a *reference* with
 * **no network call** — lifecycle ops act on the id directly, and
 * `await ref.load()` fetches the data (returning a loaded handle) only
 * when you need it.
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/10_lightweight_handles.ts <jobId>
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const [jobId] = process.argv.slice(2);
  if (!jobId) throw new Error("usage: 10_lightweight_handles.ts <jobId>");

  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  const jobRef = client.job(jobId); // no round-trip
  await jobRef.run.stop(); // POST /stop directly — no preceding GET

  // load() fetches the job and returns a loaded handle with `.data`:
  const job = await jobRef.load();
  console.log(`status=${job.data.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
