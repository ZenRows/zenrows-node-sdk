/**
 * 07: HMAC signing-key rotation lifecycle.
 *
 * Webhook deliveries can be HMAC-signed (set `signature: true` on the
 * webhook config). Rotate keys with a candidate → finalize flow:
 * `rotateHmacKey()` mints a candidate and returns the `secret` ONCE
 * (capture it now); `finalizeHmacKey()` promotes it to active;
 * `cancelHmacRotation()` aborts a pending candidate.
 *
 *   ZENROWS_API_KEY=zr_... npx tsx examples/batch/07_hmac_rotation.ts
 */

import { ZenRowsBatchClient } from "zenrows/batch";

async function main(): Promise<void> {
  const client = new ZenRowsBatchClient(process.env.ZENROWS_API_KEY as string);

  const before = await client.listHmacKeys();
  console.log(
    `active=${before.active?.kid ?? "none"} candidate=${before.candidate?.kid ?? "none"}`,
  );

  const created = await client.rotateHmacKey();
  console.log(`candidate kid=${created.kid}; secret (store now!)=${created.secret}`);

  const finalized = await client.finalizeHmacKey();
  console.log(`active kid is now ${finalized.activeKid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
