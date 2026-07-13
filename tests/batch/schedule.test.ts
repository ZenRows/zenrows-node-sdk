import { describe, expect, test } from "vitest";
import { resolveSchedule } from "../../src/batch/schedule";

describe("resolveSchedule — rate", () => {
  test("parses duration strings", () => {
    expect(resolveSchedule({ every: "15m" })).toEqual({ rate: { every: 15, unit: "minute" } });
    expect(resolveSchedule({ every: "6h" })).toEqual({ rate: { every: 6, unit: "hour" } });
    expect(resolveSchedule({ every: "1d" })).toEqual({ rate: { every: 1, unit: "day" } });
  });

  test("rejects malformed / zero durations", () => {
    // @ts-expect-error "6s" is not a valid Duration
    expect(() => resolveSchedule({ every: "6s" })).toThrow(/invalid duration/);
    // @ts-expect-error non-numeric
    expect(() => resolveSchedule({ every: "h" })).toThrow(/invalid duration/);
    expect(() => resolveSchedule({ every: "0h" })).toThrow(/>= 1/);
  });
});

describe("resolveSchedule — at (one-shot)", () => {
  test("builds a naive-timestamp schedule", () => {
    expect(resolveSchedule({ at: "2026-09-01T09:00:00", tz: "Europe/Berlin" })).toEqual({
      at: "2026-09-01T09:00:00",
      timezone: "Europe/Berlin",
    });
  });

  test("formats a Date by its UTC calendar fields", () => {
    const s = resolveSchedule({ at: new Date(Date.UTC(2026, 8, 1, 9, 0, 0)), tz: "UTC" });
    expect(s.at).toBe("2026-09-01T09:00:00");
  });

  test("rejects tz-suffixed timestamps and invalid tz", () => {
    expect(() => resolveSchedule({ at: "2026-09-01T09:00:00Z", tz: "UTC" })).toThrow(/tz-naive/);
    expect(() => resolveSchedule({ at: "2026-09-01T09:00:00", tz: "Nope/Nowhere" })).toThrow(
      /valid IANA/,
    );
  });
});

describe("resolveSchedule — calendar", () => {
  test("daily (no days/dates)", () => {
    expect(resolveSchedule({ times: ["09:00", "18:00"], tz: "UTC" })).toEqual({
      calendar: { timesOfDay: ["09:00", "18:00"], cadence: { daily: {} } },
      timezone: "UTC",
    });
  });

  test("weekly", () => {
    expect(
      resolveSchedule({ times: ["09:00"], days: ["mon", "wed", "fri"], tz: "Europe/Berlin" }),
    ).toEqual({
      calendar: { timesOfDay: ["09:00"], cadence: { weekly: { days: ["mon", "wed", "fri"] } } },
      timezone: "Europe/Berlin",
    });
  });

  test("monthly (dates)", () => {
    expect(resolveSchedule({ times: ["12:00"], dates: [1, 15], tz: "UTC" })).toEqual({
      calendar: { timesOfDay: ["12:00"], cadence: { monthly: { days: [1, 15] } } },
      timezone: "UTC",
    });
  });

  test("validates full-hour times, day names, and date ranges", () => {
    expect(() => resolveSchedule({ times: ["09:30"], tz: "UTC" })).toThrow(/on the hour/);
    // @ts-expect-error bad day name
    expect(() => resolveSchedule({ times: ["09:00"], days: ["funday"], tz: "UTC" })).toThrow(
      /invalid day/,
    );
    expect(() => resolveSchedule({ times: ["09:00"], dates: [32], tz: "UTC" })).toThrow(/1..31/);
  });
});
