[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / ScheduleInput

# Type Alias: ScheduleInput

> **ScheduleInput** = \{ `every`: [`Duration`](Duration.md); \} \| \{ `at`: `string` \| `Date`; `tz`: `string`; \} \| \{ `times`: `string`[]; `tz`: `string`; \} \| \{ `times`: `string`[]; `tz`: `string`; `days`: [`DayOfWeek`](DayOfWeek.md)[]; \} \| \{ `times`: `string`[]; `tz`: `string`; `dates`: `number`[]; \}

Defined in: [src/batch/schedule.ts:43](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/schedule.ts#L43)

A schedule, as a discriminated union:
  - `{ every }`                     — fire on an interval (no wall clock).
  - `{ at, tz }`                    — one-shot at a tz-naive wall-clock time.
  - `{ times, tz }`                 — calendar, every day (daily).
  - `{ times, tz, days }`           — calendar, on days of the week.
  - `{ times, tz, dates }`          — calendar, on days of the month.
