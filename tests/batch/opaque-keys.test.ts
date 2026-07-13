import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { OPAQUE_VALUE_KEYS } from "../../src/batch/case";

/**
 * Guard: the case mapper preserves the KEYS of free-form maps
 * (`additionalProperties` in the spec) rather than camelCasing them —
 * `zenrowsParams`, `metadata`, `failureReasons`, `headers`. That set is
 * a hardcoded blocklist. If the API grows a new free-form map field and
 * nobody adds it here, the mapper silently mangles its keys.
 *
 * This test derives the required set straight from `docs/openapi.yaml`:
 * every property whose schema is an open map (has `additionalProperties`
 * and no fixed `properties`) must be listed in OPAQUE_VALUE_KEYS. A new
 * one makes this fail loudly instead.
 */

// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec nodes.
type Node = any;

const specPath = fileURLToPath(new URL("../../docs/openapi.yaml", import.meta.url));
const spec = parse(readFileSync(specPath, "utf8"));
const schemas: Record<string, Node> = spec.components?.schemas ?? {};

function resolve(node: Node): Node {
  let cur = node;
  while (cur && typeof cur === "object" && typeof cur.$ref === "string") {
    const name = cur.$ref.split("/").pop() as string;
    cur = schemas[name];
  }
  return cur;
}

/** An object schema with arbitrary keys: `additionalProperties` set, no `properties`. */
function isOpenMap(node: Node): boolean {
  const n = resolve(node);
  if (!n || typeof n !== "object") return false;
  const ap = n.additionalProperties;
  const hasFixedProps = n.properties && Object.keys(n.properties).length > 0;
  return !!ap && ap !== false && !hasFixedProps;
}

/** Collect the names of every property, anywhere, whose value is an open map. */
function collectOpenMapFields(): Set<string> {
  const found = new Set<string>();
  const seen = new Set<Node>();

  function walk(node: Node): void {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (typeof node.$ref === "string") {
      walk(resolve(node));
      return;
    }
    if (node.properties) {
      for (const [name, child] of Object.entries<Node>(node.properties)) {
        if (isOpenMap(child)) found.add(name);
        walk(child);
      }
    }
    if (node.items) walk(node.items);
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      walk(node.additionalProperties);
    }
    for (const key of ["allOf", "oneOf", "anyOf"] as const) {
      if (Array.isArray(node[key])) for (const sub of node[key]) walk(sub);
    }
  }

  for (const schema of Object.values(schemas)) walk(schema);
  return found;
}

describe("opaque-key preservation guard", () => {
  const fields = collectOpenMapFields();

  test("the spec actually has some open-map fields (test is live)", () => {
    expect(fields.size).toBeGreaterThan(0);
    // The ones we know about today.
    for (const known of ["zenrows_params", "metadata", "failure_reasons", "headers"]) {
      expect(fields.has(known)).toBe(true);
    }
  });

  test("every open-map field in the spec is preserved by the mapper", () => {
    const missing = [...fields].filter((name) => !OPAQUE_VALUE_KEYS.has(name));
    expect(
      missing,
      `OpenAPI has free-form map field(s) [${missing.join(", ")}] whose keys the case mapper would mangle. Add them (snake + camel casing) to OPAQUE_VALUE_KEYS in src/batch/case.ts.`,
    ).toEqual([]);
  });
});
