import { templateBounds, type Template } from "./building-coordinates.js";
import { features } from "./features.js";
import { iconTypes } from "./icons.js";
import type { Theme } from "./theme.js";
import type { FullConfig } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function expected(field: string, what: string, value: unknown): Error {
  return new Error(`${field}: expected ${what}, got ${JSON.stringify(value)}`);
}

/** `field` extended by a record key, quoted so ids like `"bm-x-01"` stay readable. */
const keyed = (field: string, key: string): string => `${field}[${JSON.stringify(key)}]`;

function object(value: unknown, field: string, what = "an object"): Record<string, unknown> {
  if (!isObject(value)) throw expected(field, what, value);
  return value;
}

function objectAt(
  parent: Record<string, unknown>,
  key: string,
  field: string,
  what = "an object",
): Record<string, unknown> {
  return object(parent[key], `${field}.${key}`, what);
}

/** The array at `parent[key]`, `[]` when absent. */
function optionalArrayAt(
  parent: Record<string, unknown>,
  key: string,
  field: string,
): unknown[] {
  const value = parent[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw expected(`${field}.${key}`, "an array", value);
  return value;
}

function number(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw expected(field, "a number", value);
  }
}

function positive(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw expected(field, "a positive number", value);
  }
}

function boolean(value: unknown, field: string): void {
  if (typeof value !== "boolean") throw expected(field, "a boolean", value);
}

function optional(
  value: unknown,
  field: string,
  check: (value: unknown, field: string) => void,
): void {
  if (value !== undefined) check(value, field);
}

function oneOf(value: unknown, allowed: readonly string[], field: string): void {
  if (!allowed.includes(value as string)) {
    throw expected(field, `one of ${allowed.join(", ")}`, value);
  }
}

/** A `{ x, y }` of numbers, returned so a caller can read its other fields. */
function point(value: unknown, field: string): Record<string, unknown> {
  if (!isObject(value) || typeof value.x !== "number" || typeof value.y !== "number") {
    throw expected(field, "{ x, y }", value);
  }
  return value;
}

const ANCHORS = ["TL", "TR", "BL", "BR"];

function anchor(value: unknown, field: string): void {
  oneOf(value, ANCHORS, field);
}

/**
 * The layout `name` selects, or `undefined` for `""` (no layout). Throws on
 * any other id `layouts` does not own: a mistyped or stale id would otherwise
 * render a bare board that looks deliberate. With no layouts at all the likely
 * cause is a layout named without its terrain, so the message says to pass one.
 */
function selectedLayout(layouts: Record<string, unknown>, name: string): unknown {
  if (name === "") return undefined;
  if (Object.hasOwn(layouts, name)) return layouts[name];
  const why =
    Object.keys(layouts).length === 0
      ? "terrain.layout is empty; pass the terrain that defines it " +
        "(e.g. terrain: gwTerrain)"
      : "not a key of terrain.layout";
  throw new Error(`unknown layout ${JSON.stringify(name)}: ${why}`);
}

/** A rectangle's size, or a polygon's points; `templateBounds` owns the box rules. */
function checkTemplate(value: unknown, field: string, name: string): void {
  const template = object(value, field);
  if ("points" in template) {
    const { points } = template;
    if (!Array.isArray(points)) throw expected(`${field}.points`, "an array", points);
    points.forEach((p, i) => point(p, `${field}.points[${i}]`));
  } else {
    positive(template.width, `${field}.width`);
    positive(template.height, `${field}.height`);
  }
  templateBounds(template as Template, name);
}

function checkBuilding(
  value: unknown,
  field: string,
  templates: Record<string, unknown>,
): void {
  const building = object(value, field);
  const { type } = building;
  if (typeof type !== "string" || !Object.hasOwn(templates, type)) {
    throw expected(`${field}.type`, "a key of config.terrain.templates", type);
  }
  optional(building.from, `${field}.from`, anchor);
  const corners = objectAt(building, "corners", field);
  const names = Object.keys(corners);
  if (names.length < 1 || names.length > 2) {
    throw expected(`${field}.corners`, "1 or 2 corners", corners);
  }
  if (!names.every((name) => ANCHORS.includes(name))) {
    throw expected(`${field}.corners`, `keys among ${ANCHORS.join(", ")}`, names);
  }
  for (const name of names) {
    const corner = `${field}.corners.${name}`;
    const spec = point(corners[name], corner);
    optional(spec.from, `${corner}.from`, anchor);
  }
  optional(building.mirror, `${field}.mirror`, boolean);
}

function checkIcon(value: unknown, field: string): void {
  const icon = object(value, field);
  oneOf(icon.type, iconTypes, `${field}.type`);
  point(icon.pos, `${field}.pos`);
  const { player } = icon;
  if (player !== undefined && player !== "attacker" && player !== "defender") {
    throw expected(`${field}.player`, '"attacker" or "defender"', player);
  }
}

/** `palette` is the theme's; without one a colour need only be a string. */
function checkFeature(value: unknown, field: string, palette?: readonly string[]): void {
  const feature = object(value, field);
  oneOf(feature.type, Object.keys(features), `${field}.type`);
  number(feature.x, `${field}.x`);
  number(feature.y, `${field}.y`);
  positive(feature.width, `${field}.width`);
  positive(feature.height, `${field}.height`);
  // A quoted YAML `rotation: "30"` would string-concatenate in `mirror`.
  optional(feature.rotation, `${field}.rotation`, number);
  if (palette) {
    oneOf(feature.color, palette, `${field}.color`);
  } else if (typeof feature.color !== "string") {
    throw expected(`${field}.color`, "a string", feature.color);
  }
  optional(feature.mirror, `${field}.mirror`, boolean);
}

function checkLayout(
  value: unknown,
  field: string,
  templates: Record<string, unknown>,
  palette?: readonly string[],
): void {
  const layout = object(value, field);
  optionalArrayAt(layout, "templates", field).forEach((building, i) =>
    checkBuilding(building, `${field}.templates[${i}]`, templates),
  );
  optionalArrayAt(layout, "icons", field).forEach((icon, i) =>
    checkIcon(icon, `${field}.icons[${i}]`),
  );
  optionalArrayAt(layout, "features", field).forEach((feature, i) =>
    checkFeature(feature, `${field}.features[${i}]`, palette),
  );
}

function checkObjective(value: unknown, field: string): void {
  const objective = point(value, field);
  number(objective.number, `${field}.number`);
}

function checkAnnotation(value: unknown, field: string): void {
  const kind = (value as { kind?: unknown } | null)?.kind;
  // Checked first: an unknown kind would otherwise draw as an arrow.
  if (kind !== "text" && kind !== "arrow") {
    throw expected(`${field}.kind`, '"text" or "arrow"', kind);
  }
  const arrow = point(value, field);
  optional(arrow.endX, `${field}.endX`, number);
  optional(arrow.endY, `${field}.endY`, number);
}

/**
 * The one check of untrusted input: everything a render reads, pieces
 * included, so a malformed config (hand-built, or YAML from the viewer's
 * editor) fails naming the field rather than with a TypeError from deep in a
 * layer, and the layers trust what they are given. Of the terrain, a render
 * reads the templates and the selected layout, so only those are checked.
 *
 * Feature colours are `theme.feature.palette` keys, so they are checked
 * against `theme` when one is given; without it, only that each is a string.
 * A corner pair that disagrees with its template edge is found by resolving
 * it, so that is left to the placement module.
 */
export function checkConfig(config: unknown, theme?: Theme): asserts config is FullConfig {
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
  for (const toggle of ["half_way_lines", "grid", "territory"]) {
    objectAt(base, toggle, "config.base", "an object (e.g. {} or { draw: false })");
  }

  const deployment = objectAt(config, "deployment", "config");
  for (const side of ["attacker", "defender"]) {
    const field = `config.deployment.${side}.deployment_zone`;
    const zone = objectAt(deployment, side, "config.deployment").deployment_zone;
    if (!Array.isArray(zone)) throw expected(field, "an array", zone);
    zone.forEach((p, i) => point(p, `${field}[${i}]`));
  }
  if (deployment.territory !== undefined) {
    const territory = objectAt(deployment, "territory", "config.deployment");
    point(territory.start, "config.deployment.territory.start");
    point(territory.end, "config.deployment.territory.end");
  }

  const terrain = objectAt(
    config,
    "terrain",
    "config",
    "{ templates, layout, layout_name }",
  );
  const templates = objectAt(terrain, "templates", "config.terrain");
  const layouts = objectAt(terrain, "layout", "config.terrain");
  const name = terrain.layout_name;
  if (typeof name !== "string") {
    throw expected("config.terrain.layout_name", "a string", name);
  }
  for (const [key, template] of Object.entries(templates)) {
    checkTemplate(template, keyed("config.terrain.templates", key), key);
  }
  const palette = theme && Object.keys(theme.feature.palette);
  const layout = selectedLayout(layouts, name);
  if (layout !== undefined) {
    checkLayout(layout, keyed("config.terrain.layout", name), templates, palette);
  }

  optionalArrayAt(config, "objectives", "config").forEach((objective, i) =>
    checkObjective(objective, `config.objectives[${i}]`),
  );
  optionalArrayAt(config, "annotations", "config").forEach((annotation, i) =>
    checkAnnotation(annotation, `config.annotations[${i}]`),
  );
  optionalArrayAt(config, "features", "config").forEach((feature, i) =>
    checkFeature(feature, `config.features[${i}]`, palette),
  );
}
