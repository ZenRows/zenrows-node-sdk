/**
 * 02: Bulk-download every successful result to a directory.
 *
 * `downloadToDir` streams one body at a time (memory stays bounded).
 * Tune `concurrency` to fan the body-fetches out; pass `onProgress`
 * for a live count. Files are named `<taskId>.<ext>` by default, or
 * `<externalId>.<ext>` with `useExternalId: true`.
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/02_download_to_dir.ts <jobId> ./out
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const [jobId, outDir = "./out"] = process.argv.slice(2);
  if (!jobId) throw new Error("usage: 02_download_to_dir.ts <jobId> [outDir]");

  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);
  const count = await client.job(jobId).run.downloadToDir(outDir, {
    status: "successful",
    concurrency: 8,
    useExternalId: true,
    onProgress: (done: number) => process.stdout.write(`\rdownloaded ${done}`),
  });
  console.log(`\nwrote ${count} files to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
