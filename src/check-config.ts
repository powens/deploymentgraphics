import type { FullConfig } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function expected(field: string, what: string, value: unknown): Error {
  return new Error(`${field}: expected ${what}, got ${JSON.stringify(value)}`);
}

function objectAt(
  parent: Record<string, unknown>,
  key: string,
  field: string,
  what = "an object",
): Record<string, unknown> {
  const value = parent[key];
  if (!isObject(value)) throw expected(`${field}.${key}`, what, value);
  return value;
}

function optionalArrayAt(parent: Record<string, unknown>, key: string): void {
  const value = parent[key];
  if (value !== undefined && !Array.isArray(value)) {
    throw expected(`config.${key}`, "an array", value);
  }
}

/**
 * Checks the shape a render reads before any layer reads it, so a malformed
 * config (hand-built, or YAML from the viewer's editor) fails naming the field
 * rather than with a TypeError from deep in a layer. Containers only: points,
 * placements, toggles, objectives and annotations are checked where they are
 * read.
 */
export function checkConfig(config: unknown): asserts config is FullConfig {
  if (!isObject(config)) throw expected("config", "an object", config);

  const base = objectAt(config, "base", "config");
  const size = base.size;
  if (
    !isObject(size) ||
    !(typeof size.width === "number" && size.width > 0) ||
    !(typeof size.height === "number" && size.height > 0)
  ) {
    throw expected("config.base.size", "{ width, height } of positive numbers", size);
  }

  const deployment = objectAt(config, "deployment", "config");
  for (const side of ["attacker", "defender"]) {
    const zone = objectAt(deployment, side, "config.deployment").deployment_zone;
    if (!Array.isArray(zone)) {
      throw expected(`config.deployment.${side}.deployment_zone`, "an array", zone);
    }
  }

  const terrain = objectAt(
    config,
    "terrain",
    "config",
    "{ templates, layout, layout_name }",
  );
  objectAt(terrain, "templates", "config.terrain");
  objectAt(terrain, "layout", "config.terrain");
  if (typeof terrain.layout_name !== "string") {
    throw expected("config.terrain.layout_name", "a string", terrain.layout_name);
  }

  for (const key of ["objectives", "annotations", "features"]) {
    optionalArrayAt(config, key);
  }
}
