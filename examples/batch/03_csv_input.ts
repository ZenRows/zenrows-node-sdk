/**
 * 03: Submit URLs from a CSV via the `uploadCsv` helper.
 *
 * `uploadCsv` allocates the slot, PUTs your file to the presigned URL,
 * and returns the `fileInputId` — one call instead of three. Map
 * canonical task fields (`url`, optional `externalId`) to CSV columns
 * by name (needs `header: true`) or 0-based index.
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/03_csv_input.ts leads.csv
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const [csvPath = "leads.csv"] = process.argv.slice(2);
  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  const fileInputId = await client.uploadCsv(csvPath, {
    fields: { url: "Page URL", externalId: "Lead Ref" },
    header: true,
  });
  console.log(`uploaded, fileInputId=${fileInputId}`);

  const job = await client.submitRegular({
    fileInputId,
    zenrowsParams: { js_render: "true" },
  });
  console.log(`submitted ${job.jobId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
