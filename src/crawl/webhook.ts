import { type VerifyWebhookSignatureOptions, verifyWebhookSignature } from "../batch/webhook.js";

/**
 * Check a crawl event's `X-Signature` header, before you trust or parse its body.
 *
 * The header reads `t=<unix seconds>,v1=<hex HMAC-SHA256>,kid=<key id>`. The signature covers
 * `t`, a literal `.`, then the raw request body, keyed with the account's webhook signing key
 * (base64, from the dashboard); this helper decodes it to the key bytes.
 *
 * Pass the body exactly as received. `secrets` maps each key id to its base64 secret, so a
 * receiver accepts both the old and the new key during a rotation; the header's `kid` picks the
 * one to check. The comparison is constant-time.
 *
 * Returns `false` for a missing or malformed header, an unknown `kid`, a secret that isn't a
 * 32-byte base64 key, a timestamp further than `toleranceSeconds` (default 300) from now, or a
 * wrong signature. An event can arrive more than once: drop a repeat by its `event_id`.
 */
export function verifyCrawlWebhookSignature(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  secrets: Record<string, string>,
  options: VerifyWebhookSignatureOptions = {},
): boolean {
  return verifyWebhookSignature(rawBody, signatureHeader, secrets, options);
}
