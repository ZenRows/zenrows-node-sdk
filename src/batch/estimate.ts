/**
 * Client-side cost estimation for Batch jobs.
 *
 * The Batch API prices a scrape per **successful request**, driven by
 * two scraper knobs (`js_render`, `premium_proxy`) plus the dynamic
 * `mode=auto`. The rate card is small and identical for every caller,
 * so estimation lives client-side — there is intentionally no
 * `POST /jobs/estimate` endpoint.
 *
 * What an estimate answers: *if every URL succeeds exactly once, what
 * is the charge?* It ignores failures, `retries`, and `reruns`. An
 * estimate is *exact* (`min === max`) iff it contains no `mode=auto`
 * tasks; each auto task widens the interval by 24 credits.
 */

import type { ScraperParams, TaskInputLike } from "./types.js";

// Credits charged per successful request, by configuration.
export const BASE_CREDITS = 1;
export const JS_CREDITS = 5;
export const PREMIUM_PROXY_CREDITS = 10;
export const JS_AND_PROXY_CREDITS = 25;
export const AUTO_MIN_CREDITS = 1;
export const AUTO_MAX_CREDITS = 25;

const TRUTHY = new Set(["true", "1", "yes", "on"]);

/** The pricing tier a task falls into. Exactly one per task. */
export type Tier = "base" | "js_render" | "premium_proxy" | "js_render+premium_proxy" | "auto";

// Stable render order for breakdown lines.
const TIER_ORDER: readonly Tier[] = [
  "base",
  "js_render",
  "premium_proxy",
  "js_render+premium_proxy",
  "auto",
];

/** The credit interval for a single task. `min === max` except `auto`. */
export interface TaskCost {
  tier: Tier;
  min: number;
  max: number;
}

/** One row of a breakdown: all tasks sharing a tier, aggregated. */
export interface CostLine {
  tier: Tier;
  count: number;
  unitMin: number;
  unitMax: number;
  subtotalMin: number;
  subtotalMax: number;
  exact: boolean;
}

type ParamValue = string | boolean | number;

function truthy(value: ParamValue | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return TRUTHY.has(value.trim().toLowerCase());
  return false;
}

function isAuto(params: ScraperParams): boolean {
  return (
    String(params.mode ?? "")
      .trim()
      .toLowerCase() === "auto"
  );
}

/**
 * Price one task from its **merged** scraper params (job-level
 * overlaid with per-task, task wins).
 */
export function costForParams(params: ScraperParams): TaskCost {
  if (isAuto(params)) return { tier: "auto", min: AUTO_MIN_CREDITS, max: AUTO_MAX_CREDITS };
  const js = truthy(params.js_render);
  const px = truthy(params.premium_proxy);
  if (js && px) {
    return {
      tier: "js_render+premium_proxy",
      min: JS_AND_PROXY_CREDITS,
      max: JS_AND_PROXY_CREDITS,
    };
  }
  if (px) return { tier: "premium_proxy", min: PREMIUM_PROXY_CREDITS, max: PREMIUM_PROXY_CREDITS };
  if (js) return { tier: "js_render", min: JS_CREDITS, max: JS_CREDITS };
  return { tier: "base", min: BASE_CREDITS, max: BASE_CREDITS };
}

function taskParams(task: TaskInputLike): ScraperParams {
  if (typeof task === "string") return {};
  return { ...(task.zenrowsParams ?? {}) };
}

/**
 * Result of {@link estimateCost}. Credits assuming every task succeeds
 * once. `exact` (`min === max`) when no task uses `mode=auto`.
 */
export class CostEstimate {
  constructor(
    readonly taskCount: number,
    readonly min: number,
    readonly max: number,
    readonly breakdown: readonly CostLine[],
  ) {}

  /** True when the charge is a single number (no auto tasks). */
  get exact(): boolean {
    return this.min === this.max;
  }

  /** How many tasks use `mode=auto` — the only source of range. */
  get autoTasks(): number {
    return this.breakdown
      .filter((line) => line.tier === "auto")
      .reduce((sum, line) => sum + line.count, 0);
  }

  toString(): string {
    const credits = this.exact ? `${this.min}` : `${this.min}-${this.max}`;
    return `${credits} credits (${this.taskCount} tasks)`;
  }

  /** Multi-line breakdown table. */
  format(): string {
    const lines = [`${this.taskCount} tasks → ${this.toString()}`];
    for (const line of this.breakdown) {
      const unit = line.exact ? `${line.unitMin}` : `${line.unitMin}-${line.unitMax}`;
      const sub = line.exact ? `${line.subtotalMin}` : `${line.subtotalMin}-${line.subtotalMax}`;
      lines.push(`  ${String(line.count).padStart(6)} × ${line.tier} (${unit}) = ${sub}`);
    }
    return lines.join("\n");
  }
}

/**
 * Estimate the credit cost of a job, assuming every task succeeds
 * once. Pure and offline — no network call.
 *
 * `tasks` is the same shape `submitRegular` accepts: bare URL strings
 * or task objects. Per-task `zenrowsParams` override the job-level
 * `zenrowsParams` on key collision (task wins), matching the worker.
 *
 * Note: `fileInputId` (CSV) jobs can't be estimated this way — the row
 * count isn't known client-side. Estimate from the in-memory task list.
 */
export function estimateCost(
  tasks: Iterable<TaskInputLike>,
  options: { zenrowsParams?: ScraperParams } = {},
): CostEstimate {
  const jobParams = options.zenrowsParams ?? {};
  const agg = new Map<Tier, { count: number; unitMin: number; unitMax: number }>();
  let totalMin = 0;
  let totalMax = 0;
  let count = 0;
  for (const task of tasks) {
    count += 1;
    const merged = { ...jobParams, ...taskParams(task) };
    const tc = costForParams(merged);
    totalMin += tc.min;
    totalMax += tc.max;
    const existing = agg.get(tc.tier);
    if (existing) existing.count += 1;
    else agg.set(tc.tier, { count: 1, unitMin: tc.min, unitMax: tc.max });
  }

  const breakdown: CostLine[] = [];
  for (const tier of TIER_ORDER) {
    const entry = agg.get(tier);
    if (!entry) continue;
    breakdown.push({
      tier,
      count: entry.count,
      unitMin: entry.unitMin,
      unitMax: entry.unitMax,
      subtotalMin: entry.count * entry.unitMin,
      subtotalMax: entry.count * entry.unitMax,
      exact: entry.unitMin === entry.unitMax,
    });
  }
  return new CostEstimate(count, totalMin, totalMax, breakdown);
}
