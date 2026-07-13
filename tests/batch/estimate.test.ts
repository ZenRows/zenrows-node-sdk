import { describe, expect, test } from "vitest";
import { costForParams, estimateCost } from "../../src/batch/estimate";

describe("costForParams", () => {
  test("prices each tier", () => {
    expect(costForParams({}).tier).toBe("base");
    expect(costForParams({}).min).toBe(1);
    expect(costForParams({ js_render: "true" })).toMatchObject({
      tier: "js_render",
      min: 5,
      max: 5,
    });
    expect(costForParams({ premium_proxy: true })).toMatchObject({
      tier: "premium_proxy",
      min: 10,
    });
    expect(costForParams({ js_render: "true", premium_proxy: "true" })).toMatchObject({
      tier: "js_render+premium_proxy",
      min: 25,
      max: 25,
    });
  });

  test("auto is a dynamic 1..25 range and wins over flags", () => {
    expect(costForParams({ mode: "auto" })).toMatchObject({ tier: "auto", min: 1, max: 25 });
    expect(costForParams({ mode: "auto", js_render: "true" }).tier).toBe("auto");
  });

  test("truthy spellings", () => {
    expect(costForParams({ js_render: "yes" }).tier).toBe("js_render");
    expect(costForParams({ js_render: "false" }).tier).toBe("base");
    expect(costForParams({ premium_proxy: 1 }).tier).toBe("premium_proxy");
  });
});

describe("estimateCost", () => {
  test("exact estimate with a per-tier breakdown", () => {
    const est = estimateCost(["https://a", "https://b"], { zenrowsParams: { js_render: "true" } });
    expect(est.exact).toBe(true);
    expect(est.min).toBe(10);
    expect(est.max).toBe(10);
    expect(est.taskCount).toBe(2);
    expect(est.toString()).toBe("10 credits (2 tasks)");
    expect(est.breakdown).toHaveLength(1);
    expect(est.breakdown[0]).toMatchObject({ tier: "js_render", count: 2, subtotalMin: 10 });
  });

  test("per-task params override job-level (task wins)", () => {
    const est = estimateCost(
      ["https://a", { url: "https://b", zenrowsParams: { premium_proxy: "true" } }],
      { zenrowsParams: { js_render: "true" } },
    );
    // a: js(5). b: inherits job-level js_render AND adds premium → both (25).
    // Merge is {...job, ...task}: task adds keys, only collisions are overridden.
    expect(est.min).toBe(30);
  });

  test("auto tasks make the estimate a range", () => {
    const est = estimateCost([{ url: "https://a", zenrowsParams: { mode: "auto" } }, "https://b"]);
    expect(est.exact).toBe(false);
    expect(est.autoTasks).toBe(1);
    expect(est.min).toBe(2); // auto min 1 + base 1
    expect(est.max).toBe(26); // auto max 25 + base 1
    expect(est.format()).toContain("auto");
  });
});
