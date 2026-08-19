/**
 * Client-side cost estimation, mirroring the Python SDK's rate card exactly. Pure — no
 * network call. Prices a job assuming every task succeeds once; `mode=auto` is billed
 * dynamically post-factum and is reported as a [1, 25] credit range, everything else is exact.
 */

export const BASE_CREDITS = 1;
export const JS_CREDITS = 5;
export const PREMIUM_PROXY_CREDITS = 10;
export const JS_AND_PROXY_CREDITS = 25;
export const AUTO_MIN_CREDITS = 1;
export const AUTO_MAX_CREDITS = 25;

export type Tier = "base" | "js_render" | "premium_proxy" | "js_render+premium_proxy" | "auto";

const TIER_ORDER: Tier[] = [
  "base",
  "js_render",
  "premium_proxy",
  "js_render+premium_proxy",
  "auto",
];

const TRUTHY_STRINGS = new Set(["true", "1", "yes", "on"]);

export type ParamValue = string | boolean | number | Record<string, string>;
export type ParamMap = Record<string, ParamValue>;

export interface EstimateTask {
  zenrows_params?: ParamMap;
}
export type TaskLike = string | EstimateTask | Record<string, unknown>;

export interface CostLine {
  tier: Tier;
  count: number;
  unitMin: number;
  unitMax: number;
}

export interface CostEstimate {
  taskCount: number;
  min: number;
  max: number;
  breakdown: CostLine[];
  exact: boolean;
}

function truthy(value: ParamValue | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return TRUTHY_STRINGS.has(value.trim().toLowerCase());
  return false;
}

function isAuto(params: ParamMap): boolean {
  return (
    String(params.mode ?? "")
      .trim()
      .toLowerCase() === "auto"
  );
}

function costForParams(params: ParamMap): { tier: Tier; min: number; max: number } {
  if (isAuto(params)) {
    return { tier: "auto", min: AUTO_MIN_CREDITS, max: AUTO_MAX_CREDITS };
  }
  const js = truthy(params.js_render);
  const px = truthy(params.premium_proxy);
  if (js && px) {
    return {
      tier: "js_render+premium_proxy",
      min: JS_AND_PROXY_CREDITS,
      max: JS_AND_PROXY_CREDITS,
    };
  }
  if (px) {
    return { tier: "premium_proxy", min: PREMIUM_PROXY_CREDITS, max: PREMIUM_PROXY_CREDITS };
  }
  if (js) {
    return { tier: "js_render", min: JS_CREDITS, max: JS_CREDITS };
  }
  return { tier: "base", min: BASE_CREDITS, max: BASE_CREDITS };
}

function taskParams(task: TaskLike): ParamMap {
  if (typeof task === "string") return {};
  const record = task as Record<string, unknown>;
  return (record.zenrows_params as ParamMap | undefined) ?? {};
}

/**
 * Estimate the credit cost of a job before submitting it. `tasks` accepts the same shapes
 * `submitRegular` does: bare URL strings or task objects. Per-task `zenrows_params` override
 * the job-level `zenrowsParams` on key collision (task wins), matching the worker's merge.
 */
export function estimateCost(tasks: Iterable<TaskLike>, zenrowsParams?: ParamMap): CostEstimate {
  const jobParams = zenrowsParams ?? {};
  const agg = new Map<Tier, { count: number; min: number; max: number }>();
  let totalMin = 0;
  let totalMax = 0;
  let count = 0;

  for (const task of tasks) {
    count += 1;
    const merged = { ...jobParams, ...taskParams(task) };
    const cost = costForParams(merged);
    totalMin += cost.min;
    totalMax += cost.max;
    const existing = agg.get(cost.tier);
    if (existing) {
      existing.count += 1;
    } else {
      agg.set(cost.tier, { count: 1, min: cost.min, max: cost.max });
    }
  }

  const breakdown: CostLine[] = TIER_ORDER.filter((tier) => agg.has(tier)).map((tier) => {
    const entry = agg.get(tier);
    if (!entry) throw new Error("unreachable");
    return { tier, count: entry.count, unitMin: entry.min, unitMax: entry.max };
  });

  return {
    taskCount: count,
    min: totalMin,
    max: totalMax,
    breakdown,
    exact: totalMin === totalMax,
  };
}
