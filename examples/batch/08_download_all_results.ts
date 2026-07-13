/**
 * 08: Download a whole run as one zip (server-side export).
 *
 * `downloadAllResults` drives the export flow — start an async zip of
 * every task body, poll until ready, and stream it to disk in one
 * call. Capped at 1 GiB per run server-side; for larger runs (or one
 * file per task) use `downloadToDir` (example 02).
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/08_download_all_results.ts <jobId> results.zip
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const [jobId, out = "results.zip"] = process.argv.slice(2);
  if (!jobId) throw new Error("usage: 08_download_all_results.ts <jobId> [out.zip]");

  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);
  const path = await client.job(jobId).run.downloadAllResults(out);
  console.log(`wrote ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
