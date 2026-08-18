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

type Point = { x: number; y: number };

// The presets are generated from the YAML the browser app loads (see
// scripts/gen-presets.mjs). These tests confirm the generated modules
// still deep-equal their YAML source — a correctness check on the
// generator, complementing CI's `gen:presets:check` staleness check.
const dataDir = fileURLToPath(new URL("../../static/data/", import.meta.url));
const loadYaml = (relPath: string): unknown =>
  yaml.load(readFileSync(dataDir + relPath, "utf8"));

describe("presets match the YAML source", () => {
  it("baseConfig matches base.yml", () => {
    expect(baseConfig).toEqual(loadYaml("base.yml"));
  });

  // gwTerrain merges templates-simple.yml (building templates) with
  // combined.yml (the demo + ported 40kdc layouts), mirroring buildTerrain()
  // in scripts/gen-presets.mjs.
  it("gwTerrain matches templates-simple.yml + combined.yml", () => {
    expect(gwTerrain).toEqual({
      ...(loadYaml("terrain/templates-simple.yml") as object),
      ...(loadYaml("terrain/combined.yml") as object),
    });
  });

  // gwTemplatesReal is the detailed GW footprints alone (no layouts), swapped
  // onto gwTerrain by consumers who want the higher-fidelity shapes.
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

  // The preset exports just the `matrix:` map from the YAML.
  it("eventMatrix matches event_companion_matrix.yml", () => {
    expect(eventMatrix).toEqual(
      (loadYaml("event_companion_matrix.yml") as { matrix: unknown }).matrix,
    );
  });
});

// templates-real.yml documents `shoe-mirror` as the vertical flip of `shoe`,
// which is what lets a piece and its 180-degree copy interlock into a clean
// rectangle. Both files' polygons are hand-traced and get re-fitted from time
// to time; nothing else checks that the two stay each other's reflection, and
// the last re-fit (a clamp-outward pass applied to each polygon on its own)
// broke it at 4 of 32 vertices by up to 0.02in before anyone noticed.
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
    // Compared with a tolerance rather than toEqual: the flip is exact in the
    // YAML's two-decimal source values, but shoe.height - p.y is not exact in
    // binary (11.5 - 11.49 lands on 0.010000000000000675).
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
