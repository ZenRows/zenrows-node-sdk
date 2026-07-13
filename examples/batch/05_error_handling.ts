/**
 * 05: RFC 7807 → `BatchApiError.code` branching.
 *
 * Every non-2xx surfaces as `BatchApiError`; `.code` carries the
 * stable code from the Problem body (`not_found`,
 * `idempotency_key_conflict`, `file_input_not_found`, …).
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/05_error_handling.ts
 */

import { BatchApiError, ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  try {
    await client.getJob("does-not-exist");
  } catch (err) {
    if (err instanceof BatchApiError) {
      console.log(`code=${err.code} status=${err.statusCode}`);
      if (err.code === "not_found") {
        console.log("job is gone — nothing to do");
        return;
      }
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
