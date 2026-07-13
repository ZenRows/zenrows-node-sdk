/**
 * Declarative schedules for `submitScheduled` / `job.schedule.update`.
 *
 * A schedule is a plain object — a discriminated union of the four
 * shapes the API supports. The compiler enforces that exactly one shape
 * is used and that `tz` is present where required; no `new`, no builder.
 *
 * ```ts
 * import type { ScheduleInput } from "zenrows/batch";
 *
 * client.submitScheduled({ every: "6h" }, urls);
 * client.submitScheduled({ at: "2026-09-01T09:00", tz: "Europe/Berlin" }, urls);
 * client.submitScheduled(
 *   { times: ["09:00", "18:00"], days: ["mon", "wed", "fri"], tz: "Europe/Berlin" },
 *   urls,
 * );
 * client.submitScheduled({ times: ["09:00"], tz: "UTC" }, urls);              // daily
 * client.submitScheduled({ times: ["12:00"], dates: [1, 15], tz: "UTC" }, urls); // monthly
 * ```
 *
 * Inputs are validated the same way the server would (a `1..25` credit
 * duration, tz-naive `at`, full-hour `times`, valid IANA `tz`, day-name
 * spelling, dates `1..31`) so mistakes fail fast instead of round-tripping
 * through a 400.
 */

import type { JobSchedule, ScheduleCadence } from "./types.js";

const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** A rate interval: an integer count followed by a unit — `"15m"`, `"6h"`, `"1d"`. */
export type Duration = `${number}${"m" | "h" | "d"}`;

/**
 * A schedule, as a discriminated union:
 *   - `{ every }`                     — fire on an interval (no wall clock).
 *   - `{ at, tz }`                    — one-shot at a tz-naive wall-clock time.
 *   - `{ times, tz }`                 — calendar, every day (daily).
 *   - `{ times, tz, days }`           — calendar, on days of the week.
 *   - `{ times, tz, dates }`          — calendar, on days of the month.
 */
export type ScheduleInput =
  | { every: Duration }
  | { at: string | Date; tz: string }
  | { times: string[]; tz: string }
  | { times: string[]; tz: string; days: DayOfWeek[] }
  | { times: string[]; tz: string; dates: number[] };

// ----- validation helpers -----

function validateTimezone(tz: string): void {
  if (!tz) throw new Error("tz is required (IANA name, e.g. `Europe/Berlin`)");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new Error(`tz: ${JSON.stringify(tz)} is not a valid IANA timezone`);
  }
}

function validateFullHour(s: string): void {
  if (!/^([01][0-9]|2[0-3]):00$/.test(s)) {
    throw new Error(
      `times entry ${JSON.stringify(s)} must be on the hour (\`HH:00\`); minute granularity is rejected.`,
    );
  }
}

function hasTzSuffix(raw: string): boolean {
  const trimmed = raw.trim();
  const sepIndex = Math.max(trimmed.indexOf("T"), trimmed.indexOf(" "));
  if (sepIndex < 0) return false;
  const tail = trimmed.slice(sepIndex + 1);
  if (/z$/i.test(tail)) return true;
  return tail.length >= 6 && (tail[tail.length - 6] === "+" || tail[tail.length - 6] === "-");
}

function naiveIso(at: string | Date): string {
  if (typeof at === "string") {
    if (!at.trim()) throw new Error("`at` must be a non-empty ISO timestamp string.");
    if (hasTzSuffix(at)) {
      throw new Error(
        `\`at\` ${JSON.stringify(at)} must be tz-naive (no \`Z\`, no offset). Set \`tz\` separately to keep DST transitions deterministic.`,
      );
    }
    return at;
  }
  // A Date is read by its UTC calendar fields as the naive wall-clock
  // time; construct with `Date.UTC(...)` to be explicit.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`
  );
}

const DURATION_UNITS = { m: "minute", h: "hour", d: "day" } as const;

function parseDuration(raw: string): { every: number; unit: "minute" | "hour" | "day" } {
  const match = /^(\d+)([mhd])$/.exec(raw.trim());
  if (!match) {
    throw new Error(`invalid duration ${JSON.stringify(raw)} — use like "15m", "6h", "1d"`);
  }
  const every = Number(match[1]);
  if (every < 1) throw new Error(`duration must be >= 1, got ${JSON.stringify(raw)}`);
  return { every, unit: DURATION_UNITS[match[2] as "m" | "h" | "d"] };
}

function calendarCadence(input: {
  days?: DayOfWeek[];
  dates?: number[];
}): ScheduleCadence {
  if (input.days) {
    if (!input.days.length) throw new Error("days must be non-empty");
    for (const day of input.days) {
      if (!DAYS_OF_WEEK.includes(day)) {
        throw new Error(`invalid day ${JSON.stringify(day)} (use ${DAYS_OF_WEEK.join(", ")})`);
      }
    }
    return { weekly: { days: [...input.days] } };
  }
  if (input.dates) {
    if (!input.dates.length) throw new Error("dates must be non-empty");
    for (const d of input.dates) {
      if (!Number.isInteger(d)) throw new Error(`dates must be integers, got ${d}`);
      if (d < 1 || d > 31) throw new Error(`date ${d} is out of range (1..31)`);
    }
    return { monthly: { days: [...input.dates] } };
  }
  return { daily: {} };
}

/**
 * Validate a {@link ScheduleInput} and convert it to the wire
 * {@link JobSchedule}. Throws on malformed input.
 */
export function resolveSchedule(input: ScheduleInput): JobSchedule {
  if ("every" in input) {
    return { rate: parseDuration(input.every) };
  }
  if ("at" in input) {
    validateTimezone(input.tz);
    return { at: naiveIso(input.at), timezone: input.tz };
  }
  if ("times" in input) {
    validateTimezone(input.tz);
    if (!input.times.length) throw new Error("times must be non-empty");
    for (const t of input.times) validateFullHour(t);
    const cadence = calendarCadence(input as { days?: DayOfWeek[]; dates?: number[] });
    return { calendar: { timesOfDay: [...input.times], cadence }, timezone: input.tz };
  }
  throw new Error("invalid schedule: expected one of `every` | `at` | `times`");
}
