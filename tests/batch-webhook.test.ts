import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifyWebhook } from "../src/batch/webhook";

// A delivery signed the way the Batch API signs: HMAC-SHA256 over `t + "." + raw body`, keyed
// with the RAW key bytes, while the secret handed to the customer is those bytes in base64.
// Computed independently (Python's hmac module) so the test does not just mirror the helper.
const SECRET_B64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const T = 1760000000;
const BODY =
  '{"schema":"zenrows.webhook/v1","event_id":"evt_1","event_type":"run.completed","job_id":"j1","run_id":"r1","run_sequence":1,"stats":{"total":2,"completed":2,"successful":2,"failed":0}}';
const SIG = "1cb06c874dbfb275a921703f7d5ca5b649ad6543952534feab4cb3b111673b17";
const HEADER = `t=${T},v1=${SIG},kid=k1`;
const secrets = { k1: SECRET_B64 };

describe("verifyWebhook", () => {
  test("accepts a genuine delivery (string or bytes body)", () => {
    expect(verifyWebhook(BODY, HEADER, secrets, { now: T })).toBe(true);
    expect(verifyWebhook(Buffer.from(BODY), HEADER, secrets, { now: T + 10 })).toBe(true);
  });

  test("rejects a tampered body or signature", () => {
    expect(
      verifyWebhook(BODY.replace('"failed":0', '"failed":1'), HEADER, secrets, { now: T }),
    ).toBe(false);
    const flipped = `t=${T},v1=${SIG.slice(0, -1)}0,kid=k1`;
    expect(verifyWebhook(BODY, flipped, secrets, { now: T })).toBe(false);
  });

  test("rejects the mistake of keying the HMAC with the base64 text itself", () => {
    const wrong = createHmac("sha256", SECRET_B64).update(`${T}.${BODY}`).digest("hex");
    expect(verifyWebhook(BODY, `t=${T},v1=${wrong},kid=k1`, secrets, { now: T })).toBe(false);
  });

  test("picks the secret by kid, so the old and new key both verify during a rotation", () => {
    const raw2 = randomBytes(32);
    const sig2 = createHmac("sha256", raw2).update(`${T}.${BODY}`).digest("hex");
    const both = { k1: SECRET_B64, k2: raw2.toString("base64") };
    expect(verifyWebhook(BODY, HEADER, both, { now: T })).toBe(true);
    expect(verifyWebhook(BODY, `t=${T},v1=${sig2},kid=k2`, both, { now: T })).toBe(true);
    expect(verifyWebhook(BODY, `t=${T},v1=${sig2},kid=k3`, both, { now: T })).toBe(false);
  });

  test("rejects a stale timestamp unless the tolerance is turned off", () => {
    expect(verifyWebhook(BODY, HEADER, secrets, { now: T + 301 })).toBe(false);
    expect(verifyWebhook(BODY, HEADER, secrets, { now: T - 301 })).toBe(false);
    expect(verifyWebhook(BODY, HEADER, secrets, { now: T + 301, toleranceSeconds: 600 })).toBe(
      true,
    );
    expect(verifyWebhook(BODY, HEADER, secrets, { now: T + 86_400, toleranceSeconds: 0 })).toBe(
      true,
    );
  });

  test("returns false for a malformed header", () => {
    for (const header of [
      "",
      "garbage",
      `t=${T},kid=k1`,
      `v1=${SIG},kid=k1`,
      `t=abc,v1=${SIG},kid=k1`,
      // A signature with one extra hex digit, or one missing, is not a SHA-256 digest.
      `t=${T},v1=${SIG}f,kid=k1`,
      `t=${T},v1=${SIG.slice(0, -1)},kid=k1`,
      `t=${T},v1=${SIG.slice(0, -2)},kid=k1`,
    ]) {
      expect(verifyWebhook(BODY, header, secrets, { now: T })).toBe(false);
    }
  });

  test("rejects a delivery forged with an empty key when the secret decodes to nothing", () => {
    // Node's base64 decoder drops characters it doesn't know, so these decode to zero bytes.
    // An HMAC keyed with zero bytes is one anyone can compute.
    const forgedBody = '{"forged":true}';
    const forged = createHmac("sha256", Buffer.alloc(0)).update(`${T}.${forgedBody}`).digest("hex");
    for (const bad of ["!!!", "====", "", " "]) {
      expect(verifyWebhook(forgedBody, `t=${T},v1=${forged},kid=k1`, { k1: bad }, { now: T })).toBe(
        false,
      );
    }
  });

  test("rejects a secret that is not exactly 32 bytes of canonical base64", () => {
    const short = Buffer.alloc(16, 7);
    const shortSig = createHmac("sha256", short).update(`${T}.${BODY}`).digest("hex");
    expect(
      verifyWebhook(
        BODY,
        `t=${T},v1=${shortSig},kid=k1`,
        { k1: short.toString("base64") },
        { now: T },
      ),
    ).toBe(false);
    // The right 32 bytes, but with junk Node would silently skip: not the text the API issued.
    expect(verifyWebhook(BODY, HEADER, { k1: `${SECRET_B64}!!` }, { now: T })).toBe(false);
    expect(verifyWebhook(BODY, HEADER, { k1: `!${SECRET_B64}` }, { now: T })).toBe(false);
  });

  test("accepts the issued secret with or without its = padding", () => {
    expect(verifyWebhook(BODY, HEADER, { k1: SECRET_B64.replace(/=+$/, "") }, { now: T })).toBe(
      true,
    );
  });

  test("invalid timestamp options fail closed instead of skipping the age check", () => {
    const dayOld = T + 86_400;
    expect(verifyWebhook(BODY, HEADER, secrets, { now: dayOld })).toBe(false);
    for (const toleranceSeconds of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(verifyWebhook(BODY, HEADER, secrets, { now: dayOld, toleranceSeconds })).toBe(false);
      expect(verifyWebhook(BODY, HEADER, secrets, { now: T, toleranceSeconds })).toBe(false);
    }
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(verifyWebhook(BODY, HEADER, secrets, { now })).toBe(false);
    }
  });

  test("uses the system clock when `now` is not given", () => {
    const t = Math.floor(Date.now() / 1000);
    const raw = Buffer.from(SECRET_B64, "base64");
    const sig = createHmac("sha256", raw).update(`${t}.${BODY}`).digest("hex");
    expect(verifyWebhook(BODY, `t=${t},v1=${sig},kid=k1`, secrets)).toBe(true);
    // The fixed fixture is from 2025, far outside the default 5 minutes of the real clock.
    expect(verifyWebhook(BODY, HEADER, secrets)).toBe(false);
  });

  test("a missing header from plain JavaScript is rejected, not thrown", () => {
    expect(verifyWebhook(BODY, undefined as unknown as string, secrets, { now: T })).toBe(false);
  });
});
