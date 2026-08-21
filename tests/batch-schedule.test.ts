import { describe, expect, test } from "vitest";
import { At, Calendar, Daily, Monthly, Rate, Weekly } from "../src/batch/schedule";

describe("At", () => {
  test("accepts a tz-naive ISO string", () => {
    const at = new At("2026-09-01T09:00:00", "Europe/Berlin");
    expect(at.toRequestBody()).toEqual({ at: "2026-09-01T09:00:00", timezone: "Europe/Berlin" });
  });

  test("rejects a string with a Z suffix", () => {
    expect(() => new At("2026-09-01T09:00:00Z", "Europe/Berlin")).toThrow(/tz-naive/);
  });

  test("rejects a string with a numeric offset suffix", () => {
    expect(() => new At("2026-09-01T09:00:00+02:00", "Europe/Berlin")).toThrow(/tz-naive/);
  });

  test("rejects an empty string", () => {
    expect(() => new At("", "Europe/Berlin")).toThrow(/non-empty/);
  });

  test("rejects an invalid IANA timezone", () => {
    expect(() => new At("2026-09-01T09:00:00", "Not/AZone")).toThrow(/not a valid IANA timezone/);
  });

  test("rejects an empty timezone", () => {
    expect(() => new At("2026-09-01T09:00:00", "")).toThrow(/is required/);
  });

  test("formats a Date using its local wall-clock fields", () => {
    const date = new Date(2026, 8, 1, 9, 0, 0); // month is 0-indexed: September
    const at = new At(date, "Europe/Berlin");
    expect(at.at).toBe("2026-09-01T09:00:00");
  });
});

describe("Rate", () => {
  test("builds the wire body", () => {
    expect(new Rate(15, "minute").toRequestBody()).toEqual({ rate: { every: 15, unit: "minute" } });
  });

  test("rejects every < 1", () => {
    expect(() => new Rate(0, "minute")).toThrow(/>= 1/);
  });

  test("rejects a non-integer every", () => {
    expect(() => new Rate(1.5, "minute")).toThrow(/integer/);
  });

  test("rejects an invalid unit", () => {
    // @ts-expect-error deliberately invalid for the test
    expect(() => new Rate(1, "fortnight")).toThrow(/must be one of/);
  });
});

describe("Calendar", () => {
  test("builds the wire body for a Daily cadence", () => {
    const cal = new Calendar(["09:00", "18:00"], new Daily(), "Europe/Berlin");
    expect(cal.toRequestBody()).toEqual({
      calendar: { times_of_day: ["09:00", "18:00"], cadence: { daily: {} } },
      timezone: "Europe/Berlin",
    });
  });

  test("builds the wire body for a Weekly cadence", () => {
    const cal = new Calendar(["09:00"], new Weekly(["mon", "wed", "fri"]), "Europe/Berlin");
    expect(cal.toRequestBody().calendar?.cadence).toEqual({
      weekly: { days: ["mon", "wed", "fri"] },
    });
  });

  test("builds the wire body for a Monthly cadence", () => {
    const cal = new Calendar(["09:00"], new Monthly([1, 15]), "Europe/Berlin");
    expect(cal.toRequestBody().calendar?.cadence).toEqual({ monthly: { days: [1, 15] } });
  });

  test("rejects a non-full-hour time", () => {
    expect(() => new Calendar(["09:30"], new Daily(), "Europe/Berlin")).toThrow(/on the hour/);
  });

  test("rejects an empty times_of_day", () => {
    expect(() => new Calendar([], new Daily(), "Europe/Berlin")).toThrow(/non-empty/);
  });

  test("rejects an invalid timezone", () => {
    expect(() => new Calendar(["09:00"], new Daily(), "Not/AZone")).toThrow(
      /not a valid IANA timezone/,
    );
  });
});

describe("Weekly", () => {
  test("rejects an empty days list", () => {
    expect(() => new Weekly([])).toThrow(/non-empty/);
  });

  test("rejects an invalid day name", () => {
    // @ts-expect-error deliberately invalid for the test
    expect(() => new Weekly(["monday"])).toThrow(/not a valid day/);
  });
});

describe("Monthly", () => {
  test("rejects an empty days list", () => {
    expect(() => new Monthly([])).toThrow(/non-empty/);
  });

  test("rejects a day out of range", () => {
    expect(() => new Monthly([32])).toThrow(/out of range/);
  });

  test("rejects a non-integer day", () => {
    expect(() => new Monthly([1.5])).toThrow(/must be integers/);
  });
});
