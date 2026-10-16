import { createHmac, timingSafeEqual } from "node:crypto";

/** The request header that carries a signed delivery's signature. */
export const WEBHOOK_SIGNATURE_HEADER = "X-Signature";

/** The request header that carries a delivery's event id. Deduplicate deliveries on it. */
export const WEBHOOK_EVENT_ID_HEADER = "X-ZenRows-Event-Id";

/** How far, in seconds, a signature's timestamp may be from now by default. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** The API issues every webhook signing key as 32 random bytes. */
const WEBHOOK_KEY_BYTES = 32;

/**
 * Decode a base64 signing secret, or return undefined when it isn't one the API could have
 * issued. Node's base64 decoder skips characters it doesn't recognise, so "!!!" or "===="
 * decode to an empty buffer, and an HMAC keyed with that would accept a delivery anyone can
 * sign. Require exactly 32 bytes that re-encode to the same text (ignoring `=` padding).
 */
function decodeSecret(secret: string): Buffer | undefined {
  const key = Buffer.from(secret, "base64");
  if (key.length !== WEBHOOK_KEY_BYTES) return undefined;
  const canonical = (text: string) => text.replace(/=+$/, "");
  if (canonical(key.toString("base64")) !== canonical(secret)) return undefined;
  return key;
}

export interface VerifyWebhookSignatureOptions {
  /**
   * Reject a delivery whose `t` is further than this from `now`, in seconds. Default 300.
   * `0` turns the check off. Anything that isn't a finite number of 0 or more makes every
   * delivery fail to verify.
   */
  toleranceSeconds?: number;
  /**
   * The current time as a Unix timestamp in seconds. Defaults to the system clock. A value
   * that isn't a finite number makes every delivery fail to verify.
   */
  now?: number;
}

function parseSignatureHeader(header: string): { t?: string; v1?: string; kid?: string } {
  const parts: { t?: string; v1?: string; kid?: string } = {};
  for (const piece of header.split(",")) {
    const index = piece.indexOf("=");
    if (index <= 0) continue;
    const key = piece.slice(0, index).trim();
    const value = piece.slice(index + 1).trim();
    if (key === "t" || key === "v1" || key === "kid") {
      parts[key] = value;
    }
  }
  return parts;
}

/**
 * Check a Batch webhook delivery's `X-Signature` header.
 *
 * The header reads `t=<unix seconds>,v1=<hex HMAC-SHA256>,kid=<key id>`. The signature covers
 * `t`, a literal `.`, then the raw request body, keyed with the secret `rotateHmacKey()`
 * returned. That secret is base64; this helper decodes it to the key bytes.
 *
 * Pass the body exactly as received, before any JSON parsing. `secrets` maps each key id to
 * its base64 secret, so a receiver accepts both the old and the new key during a rotation; the
 * header's `kid` picks the one to check. The comparison is constant-time.
 *
 * Returns `false` for a missing or malformed header, an unknown `kid`, a secret that isn't a
 * 32-byte base64 key, a timestamp outside the tolerance, or a wrong signature.
 * Deliveries can repeat: deduplicate on the `X-ZenRows-Event-Id` header.
 */
export function verifyWebhookSignature(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  secrets: Record<string, string>,
  options: VerifyWebhookSignatureOptions = {},
): boolean {
  const { t, v1, kid } = parseSignatureHeader(signatureHeader ?? "");
  // v1 is a hex SHA-256 digest: exactly 64 hex characters. Anything else is malformed
  // (Buffer.from(hex) would otherwise drop a trailing odd nibble).
  if (!t || !v1 || !kid || !/^\d+$/.test(t) || !/^[0-9a-fA-F]{64}$/.test(v1)) return false;

  const secret = Object.prototype.hasOwnProperty.call(secrets, kid) ? secrets[kid] : undefined;
  if (!secret) return false;

  // A bad option fails closed: NaN compares false, so it would otherwise skip the age check.
  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (!Number.isFinite(tolerance) || tolerance < 0) return false;
  if (options.now !== undefined && !Number.isFinite(options.now)) return false;
  if (tolerance > 0) {
    const now = options.now ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(t)) > tolerance) return false;
  }

  const key = decodeSecret(secret);
  if (!key) return false;
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);
  const expected = createHmac("sha256", key)
    .update(Buffer.concat([Buffer.from(`${t}.`, "utf8"), body]))
    .digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
