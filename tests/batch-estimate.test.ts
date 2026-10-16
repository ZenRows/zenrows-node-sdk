import { describe, expect, test } from "vitest";
import { estimateCost } from "../src/batch/estimate";

describe("estimateCost", () => {
  test("bare URL strings default to the base tier", () => {
    const result = estimateCost(["https://a.com", "https://b.com"]);
    expect(result).toMatchObject({ taskCount: 2, min: 2, max: 2, exact: true });
    expect(result.breakdown).toEqual([{ tier: "base", count: 2, unitMin: 1, unitMax: 1 }]);
  });

  test("js_render alone prices at the JS tier", () => {
    const result = estimateCost([{ zenrows_params: { js_render: true } }]);
    expect(result).toMatchObject({ min: 5, max: 5, exact: true });
  });

  test("premium_proxy alone prices at the premium tier", () => {
    const result = estimateCost([{ zenrows_params: { premium_proxy: true } }]);
    expect(result).toMatchObject({ min: 10, max: 10, exact: true });
  });

  test("js_render + premium_proxy together price at the combined tier", () => {
    const result = estimateCost([{ zenrows_params: { js_render: true, premium_proxy: true } }]);
    expect(result).toMatchObject({ min: 25, max: 25, exact: true });
  });

  test("mode=auto is a [1, 25] range and makes the estimate inexact", () => {
    const result = estimateCost([{ zenrows_params: { mode: "auto" } }]);
    expect(result).toMatchObject({ min: 1, max: 25, exact: false });
  });

  test("mode=auto wins even if js_render/premium_proxy are also set (malformed input)", () => {
    const result = estimateCost([{ zenrows_params: { mode: "auto", js_render: true } }]);
    expect(result.breakdown[0]?.tier).toBe("auto");
  });

  test('a flag is on for JSON true or the string "true" in any case', () => {
    expect(estimateCost([{ zenrows_params: { js_render: "true" } }]).min).toBe(5);
    expect(estimateCost([{ zenrows_params: { js_render: "TRUE" } }]).min).toBe(5);
    expect(estimateCost([{ zenrows_params: { premium_proxy: "True" } }]).min).toBe(10);
  });

  test("spellings the API rejects at submit count as off", () => {
    // The API accepts only true/false for these flags and answers 400 for anything else,
    // so none of these would ever bill as JS rendering or premium proxy.
    for (const value of ["1", "yes", "on", " true", 1, 2]) {
      expect(estimateCost([{ zenrows_params: { js_render: value } }]).min).toBe(1);
      expect(estimateCost([{ zenrows_params: { premium_proxy: value } }]).min).toBe(1);
    }
  });

  test("mode counts as auto only for the exact value the API accepts", () => {
    expect(estimateCost([{ zenrows_params: { mode: "auto" } }]).max).toBe(25);
    expect(estimateCost([{ zenrows_params: { mode: "AUTO" } }]).max).toBe(1);
  });

  test("scrape params set flat on a task are not counted (the API ignores them)", () => {
    expect(estimateCost([{ url: "https://a.com", js_render: true }]).min).toBe(1);
    expect(estimateCost([{ url: "https://a.com", premium_proxy: "true" }], {}).min).toBe(1);
  });

  test("job params, then the task's zenrows_params", () => {
    const result = estimateCost(
      [
        "https://a.com",
        { url: "https://b.com", zenrows_params: { premium_proxy: true } },
        { url: "https://c.com", zenrows_params: { js_render: "false" } },
      ],
      { js_render: true },
    );
    expect(result.breakdown).toEqual([
      { tier: "base", count: 1, unitMin: 1, unitMax: 1 },
      { tier: "js_render", count: 1, unitMin: 5, unitMax: 5 },
      { tier: "js_render+premium_proxy", count: 1, unitMin: 25, unitMax: 25 },
    ]);
    expect(result.min).toBe(31);
  });

  test("falsy string spellings and zero do not count as on", () => {
    const result = estimateCost([{ zenrows_params: { js_render: "false", premium_proxy: 0 } }]);
    expect(result.min).toBe(1);
  });

  test("per-task params override job-level params on key collision (task wins)", () => {
    const result = estimateCost([{ zenrows_params: { js_render: false } }], { js_render: true });
    // job-level says js_render:true, task overrides to false -> base tier
    expect(result.min).toBe(1);
  });

  test("job-level params apply when a task has no override", () => {
    const result = estimateCost(["https://a.com"], { premium_proxy: true });
    expect(result.min).toBe(10);
  });

  test("breakdown aggregates counts per tier and renders in stable order", () => {
    const result = estimateCost([
      "https://a.com",
      "https://b.com",
      { zenrows_params: { js_render: true } },
      { zenrows_params: { mode: "auto" } },
    ]);
    expect(result.breakdown).toEqual([
      { tier: "base", count: 2, unitMin: 1, unitMax: 1 },
      { tier: "js_render", count: 1, unitMin: 5, unitMax: 5 },
      { tier: "auto", count: 1, unitMin: 1, unitMax: 25 },
    ]);
    expect(result.min).toBe(2 * 1 + 5 + 1);
    expect(result.max).toBe(2 * 1 + 5 + 25);
  });

  test("empty task list estimates to zero, exact", () => {
    const result = estimateCost([]);
    expect(result).toMatchObject({ taskCount: 0, min: 0, max: 0, exact: true, breakdown: [] });
  });
});
