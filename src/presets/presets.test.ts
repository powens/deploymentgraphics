import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { baseConfig } from "./base.js";
import { eventMatrix } from "./event-matrix.js";
import { missions } from "./missions.js";
import { gwTerrain } from "./terrain.js";
import { gwTemplatesReal } from "./templates-real.js";
import { baseTheme } from "./theme.js";
import { templateBounds, type Template } from "../building-coordinates.js";

type Point = { x: number; y: number };

// Checks the generator's correctness; `gen:presets:check` only checks staleness.
const dataDir = fileURLToPath(new URL("../../static/data/", import.meta.url));
const loadYaml = (relPath: string): unknown =>
  yaml.load(readFileSync(dataDir + relPath, "utf8"));

describe("presets match the YAML source", () => {
  it("baseConfig matches base.yml", () => {
    expect(baseConfig).toEqual(loadYaml("base.yml"));
  });

  it("gwTerrain matches templates-simple.yml + combined.yml", () => {
    expect(gwTerrain).toEqual({
      ...(loadYaml("terrain/templates-simple.yml") as object),
      ...(loadYaml("terrain/combined.yml") as object),
    });
  });

  it("gwTemplatesReal matches templates-real.yml", () => {
    expect(gwTemplatesReal).toEqual(loadYaml("terrain/templates-real.yml"));
  });

  it.each(Object.keys(missions))("mission %s matches its YAML", (id) => {
    expect(missions[id as keyof typeof missions]).toEqual(
      loadYaml(`deployment/${id}.yml`),
    );
  });

  it("baseTheme matches theme.yml", () => {
    expect(baseTheme).toEqual(loadYaml("theme.yml"));
  });

  it("eventMatrix matches event_companion_matrix.yml", () => {
    expect(eventMatrix).toEqual(
      (loadYaml("event_companion_matrix.yml") as { matrix: unknown }).matrix,
    );
  });
});

// `shoe-mirror` must be the vertical flip of `shoe` so a piece and its
// 180-degree copy interlock. Both are hand-traced and re-fitted independently,
// which has broken this before.
describe("templates-real shoe / shoe-mirror", () => {
  it("are exact vertical flips of one another", () => {
    const templates = (
      gwTemplatesReal as {
        templates: Record<string, { height: number; points: Point[] }>;
      }
    ).templates;
    const shoe = templates["shoe"];
    const mirror = templates["shoe-mirror"];
    expect(mirror.height).toBe(shoe.height);
    expect(mirror.points).toHaveLength(shoe.points.length);
    // Tolerance, not toEqual: 11.5 - 11.49 is 0.010000000000000675 in binary.
    const worst = Math.max(
      ...shoe.points.map((p, i) =>
        Math.max(
          Math.abs(mirror.points[i].x - p.x),
          Math.abs(mirror.points[i].y - (shoe.height - p.y)),
        ),
      ),
    );
    expect(worst).toBeLessThan(1e-9);
  });
});

// Corner pins in combined.yml are computed against templates-simple, but may
// render against either set, so each shared name's Template box must match.
// Compare declared boxes, not traced geometry: real footprints protrude past
// theirs (`shoe` declares 8x11.5, traces to 8.03x11.89).
describe("templates-simple and templates-real agree on the Template box", () => {
  const templatesOf = (relPath: string): Record<string, Template> =>
    (loadYaml(relPath) as { templates: Record<string, Template> }).templates;

  const simple = templatesOf("terrain/templates-simple.yml");
  const real = templatesOf("terrain/templates-real.yml");
  const shared = Object.keys(simple).filter((name) => name in real);

  it("share at least the templates the 40kdc converters pin against", () => {
    // Guards the loop below against silently passing on an empty set.
    expect(shared).toEqual(
      expect.arrayContaining([
        "large-area",
        "small-area",
        "large-pipes",
        "small-pipes",
        "shoe",
        "shoe-mirror",
        "pipe",
        "barricade",
      ]),
    );
  });

  it.each(shared)("%s declares the same box in both files", (name) => {
    expect(templateBounds(real[name], name)).toEqual(
      templateBounds(simple[name], name),
    );
  });
});
