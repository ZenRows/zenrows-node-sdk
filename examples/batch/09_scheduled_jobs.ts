/**
 * 09: Scheduled jobs & webhooks.
 *
 * Submit a recurring job with a declarative schedule object, then pause
 * / resume / re-schedule it via `job.schedule`. Register a completion
 * webhook at submit time (`signature: true` → HMAC-signed deliveries).
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/09_scheduled_jobs.ts
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  // Every 6 hours, with a signed completion webhook.
  const job = await client.submitScheduled({
    schedule: { every: "6h" },
    urls: ["https://example.com"],
    webhook: { url: "https://hooks.example.com/zr", signature: true },
  });
  console.log(`scheduled ${job.jobId}`);

  await job.schedule.pause(); // stop firing (schedule keeps ticking)
  await job.schedule.resume(); // fire again

  // Re-schedule: 09:00 + 18:00 Berlin time, Mon/Wed/Fri.
  await job.schedule.update({
    times: ["09:00", "18:00"],
    days: ["mon", "wed", "fri"],
    tz: "Europe/Berlin",
  });
  console.log("re-scheduled to a weekly calendar");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
