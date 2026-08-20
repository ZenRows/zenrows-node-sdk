import type { JobSchedule } from "./types.js";

const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

function validateTimezone(tz: string, field: string): void {
  if (!tz) {
    throw new Error(`${field} is required (IANA name, e.g. "Europe/Berlin")`);
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new Error(`${field}: ${JSON.stringify(tz)} is not a valid IANA timezone`);
  }
}

function validateFullHour(s: string): void {
  if (s.length !== 5 || s[2] !== ":" || s.slice(3) !== "00") {
    throw new Error(
      `times_of_day entry ${JSON.stringify(s)} must be on the hour ("HH:00"); minute granularity is rejected.`,
    );
  }
  const h = Number(s.slice(0, 2));
  if (!Number.isInteger(h) || h < 0 || h > 23) {
    throw new Error(`times_of_day entry ${JSON.stringify(s)} is not a valid hour (00..23)`);
  }
}

/** True if `raw`'s time portion carries an RFC 3339-style tz tail (`Z` / `+HH:MM` / `-HH:MM`). */
function hasTzSuffix(raw: string): boolean {
  const trimmed = raw.trim();
  for (const sep of ["T", " "]) {
    const i = trimmed.indexOf(sep);
    if (i >= 0) {
      const tail = trimmed.slice(i + 1);
      if (tail.endsWith("Z") || tail.endsWith("z")) return true;
      return tail.length >= 6 && (tail[tail.length - 6] === "+" || tail[tail.length - 6] === "-");
    }
  }
  return false;
}

/** Format a Date using its LOCAL wall-clock fields (not UTC) — see `At`'s doc for why. */
function formatLocalNaive(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * One-shot fire at a specific wall-clock time. `at` must be tz-naive: a plain ISO string
 * with no `Z`/offset suffix, or a `Date` — in which case its LOCAL getters (not UTC) are
 * read as the intended wall-clock time. `timezone` is the single authoritative interpreter,
 * which is what keeps DST transitions deterministic; passing a `Date` does NOT mean "this
 * instant" — it means "this wall-clock reading, in whatever zone `timezone` names."
 */
export class At {
  readonly at: string;
  readonly timezone: string;

  constructor(at: string | Date, timezone: string) {
    validateTimezone(timezone, "At.timezone");
    if (at instanceof Date) {
      this.at = formatLocalNaive(at);
    } else {
      if (!at.trim()) {
        throw new Error("At.at must be a non-empty ISO timestamp string.");
      }
      if (hasTzSuffix(at)) {
        throw new Error(
          `At.at ${JSON.stringify(at)} must be tz-naive (no "Z", no offset). Supply timezone separately to keep DST transitions deterministic.`,
        );
      }
      this.at = at;
    }
    this.timezone = timezone;
  }

  toRequestBody(): JobSchedule {
    return { at: this.at, timezone: this.timezone };
  }
}

/** Interval-based fire policy — every N units, no alignment to wall clock. */
export class Rate {
  readonly every: number;
  readonly unit: "minute" | "hour" | "day";

  constructor(every: number, unit: "minute" | "hour" | "day") {
    if (!Number.isInteger(every)) {
      throw new TypeError(`Rate.every must be an integer, got ${every}`);
    }
    if (every < 1) {
      throw new Error(`Rate.every must be >= 1, got ${every}`);
    }
    if (unit !== "minute" && unit !== "hour" && unit !== "day") {
      throw new Error(
        `Rate.unit must be one of "minute", "hour", "day"; got ${JSON.stringify(unit)}`,
      );
    }
    this.every = every;
    this.unit = unit;
  }

  toRequestBody(): JobSchedule {
    return { rate: { every: this.every, unit: this.unit } };
  }
}

/** Fire every day. No knobs. */
export class Daily {}

/** Fire on specific days of the week. `days` must be non-empty, lower-case 3-letter names. */
export class Weekly {
  readonly days: DayOfWeek[];

  constructor(days: DayOfWeek[]) {
    if (!days.length) {
      throw new Error("Weekly.days must be non-empty");
    }
    for (const d of days) {
      if (!DAYS_OF_WEEK.includes(d)) {
        throw new Error(
          `Weekly.days entry ${JSON.stringify(d)} is not a valid day (use one of ${DAYS_OF_WEEK.join(", ")})`,
        );
      }
    }
    this.days = days;
  }
}

/** Fire on specific days of the month (1-31); days that don't exist in a given month are skipped. */
export class Monthly {
  readonly days: number[];

  constructor(days: number[]) {
    if (!days.length) {
      throw new Error("Monthly.days must be non-empty");
    }
    for (const d of days) {
      if (!Number.isInteger(d)) {
        throw new TypeError(`Monthly.days entries must be integers, got ${d}`);
      }
      if (d < 1 || d > 31) {
        throw new Error(`Monthly.days entry ${d} is out of range (1..31)`);
      }
    }
    this.days = days;
  }
}

export type Cadence = Daily | Weekly | Monthly;

/** Calendar-style fire policy: a list of times-of-day on a daily/weekly/monthly cadence. */
export class Calendar {
  readonly timesOfDay: string[];
  readonly cadence: Cadence;
  readonly timezone: string;

  constructor(timesOfDay: string[], cadence: Cadence, timezone: string) {
    validateTimezone(timezone, "Calendar.timezone");
    if (!timesOfDay.length) {
      throw new Error("Calendar.times_of_day must be non-empty");
    }
    for (const t of timesOfDay) {
      validateFullHour(t);
    }
    this.timesOfDay = timesOfDay;
    this.cadence = cadence;
    this.timezone = timezone;
  }

  toRequestBody(): JobSchedule {
    let cadenceBody:
      | { daily: object }
      | { weekly: { days: string[] } }
      | { monthly: { days: number[] } };
    if (this.cadence instanceof Daily) {
      cadenceBody = { daily: {} };
    } else if (this.cadence instanceof Weekly) {
      cadenceBody = { weekly: { days: [...this.cadence.days] } };
    } else {
      cadenceBody = { monthly: { days: [...this.cadence.days] } };
    }
    return {
      calendar: { times_of_day: [...this.timesOfDay], cadence: cadenceBody },
      timezone: this.timezone,
    };
  }
}

export type Schedule = At | Rate | Calendar;
