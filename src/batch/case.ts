/**
 * snake_case ↔ camelCase mapping at the wire boundary.
 *
 * The Batch API speaks snake_case (`job_id`, `external_id`,
 * `zenrows_params`); the SDK's public surface is camelCase
 * (`jobId`, `externalId`, `zenrowsParams`). The transport runs
 * {@link camelize} over every decoded response and {@link decamelize}
 * over every request body so neither the client methods nor callers
 * ever touch the wire casing.
 *
 * The one subtlety: some fields hold **opaque maps** whose *keys* are
 * NOT ours to rename — `zenrows_params` (scraper param names like
 * `js_render`), `metadata` (caller-supplied keys), `failure_reasons`
 * (a fixed server taxonomy like `auth_failed`), and HTTP `headers`
 * (`Content-Type`). For those the field name itself is transformed but
 * its value is copied through verbatim — see {@link OPAQUE_VALUE_KEYS}.
 */

// Field names whose VALUE is an opaque map — transform the key, copy
// the value untouched. Listed in both casings so the same set works
// for camelize (snake source) and decamelize (camel source).
//
// Exported so a test can assert it stays in sync with the OpenAPI spec:
// if a new free-form (`additionalProperties`) map field appears there
// and isn't listed here, the mapper would mangle its keys — the guard
// test in `tests/batch/opaque-keys.test.ts` fails loudly instead.
export const OPAQUE_VALUE_KEYS: ReadonlySet<string> = new Set([
  "zenrows_params",
  "zenrowsParams",
  "metadata",
  "failure_reasons",
  "failureReasons",
  "headers",
]);

const snakeToCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const camelToSnake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function transformKeys(value: unknown, keyFn: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => transformKeys(item, keyFn));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[keyFn(k)] = OPAQUE_VALUE_KEYS.has(k) ? v : transformKeys(v, keyFn);
    }
    return out;
  }
  return value;
}

/** Deep-convert wire snake_case keys to camelCase (response decode). */
export function camelize<T = unknown>(value: unknown): T {
  return transformKeys(value, snakeToCamel) as T;
}

/** Deep-convert camelCase keys to wire snake_case (request encode). */
export function decamelize<T = unknown>(value: unknown): T {
  return transformKeys(value, camelToSnake) as T;
}

// ----- compile-time key mapping (mirrors the runtime above) -----

/** Recursively camelCase a snake_case string-literal type. */
export type CamelCase<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<CamelCase<T>>}`
  : S;

/**
 * Deep-camelCase an object type. Index-signature maps (`Record<string,
 * X>` — i.e. our opaque maps) are left intact because an open `string`
 * key has no snake segments to rename, matching the runtime.
 */
export type Camelize<T> = T extends readonly (infer U)[]
  ? Camelize<U>[]
  : T extends (...args: never[]) => unknown
    ? T
    : T extends object
      ? { [K in keyof T as CamelCase<K & string>]: Camelize<T[K]> }
      : T;
