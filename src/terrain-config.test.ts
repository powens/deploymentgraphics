import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { mergeTerrain, type TerrainConfig } from "./terrain-config";
import { resolveBuilding } from "./placement";

describe("mergeTerrain", () => {
  it("reunites a templates file and a layouts file into one TerrainConfig", () => {
    const templates = { templates: { "4x6": { width: 4, height: 6 } } };
    const layouts = {
      layout: {
        "1": { templates: [{ type: "4x6", corners: { TL: { x: 0, y: 0 } } }] },
      },
    };
    expect(mergeTerrain(templates, layouts)).toEqual({
      templates: { "4x6": { width: 4, height: 6 } },
      layout: {
        "1": { templates: [{ type: "4x6", corners: { TL: { x: 0, y: 0 } } }] },
      },
    });
  });

  it("carries top-level area_terrain from the layouts file", () => {
    const merged = mergeTerrain(
      { templates: {} },
      { layout: {}, area_terrain: [{ shape: "circle", x: 1, y: 2, width: 6 }] },
    );
    expect(merged.area_terrain).toEqual([
      { shape: "circle", x: 1, y: 2, width: 6 },
    ]);
  });
});

// Canvas size taken from static/data/base.yml (`size:`).
const CANVAS = { width: 60, height: 44 };
const terrainUrl = (file: string) =>
  fileURLToPath(new URL(`../static/data/terrain/${file}`, import.meta.url));
const loadTerrainYaml = (file: string) =>
  yaml.load(readFileSync(terrainUrl(file), "utf8")) as Partial<TerrainConfig>;

describe("placeholder gw.yml", () => {
  // gw.yml carries layouts only; templates live in templates-simple.yml. Merge
  // them as gen-presets does to get a complete TerrainConfig for resolution.
  const gwTerrain = {
    ...loadTerrainYaml("templates-simple.yml"),
    ...loadTerrainYaml("gw.yml"),
  } as TerrainConfig;

  it("defines layout 1", () => {
    expect(Object.keys(gwTerrain.layout).sort()).toEqual(["1"]);
  });

  it("every building in every layout resolves without throwing", () => {
    for (const [name, layout] of Object.entries(gwTerrain.layout)) {
      for (const placement of layout.templates) {
        expect(
          () => resolveBuilding(placement, gwTerrain.templates, CANVAS),
          `layout ${name}, building type ${placement.type}`,
        ).not.toThrow();
      }
    }
  });

  it("tags the two demo fortresses with opposite players", () => {
    const icons = gwTerrain.layout["1"].icons ?? [];
    const players = icons
      .filter((i) => i.type === "fortress")
      .map((i) => i.player);
    expect(players).toContain("attacker");
    expect(players).toContain("defender");
  });

  it("demos every feature type with a known palette colour", () => {
    const features = gwTerrain.layout["1"].features ?? [];
    const types = features.map((f) => f.type).sort();
    expect(types).toEqual(["generator", "l-ruin", "l-ruin-roof", "pipe"]);
    const palette = ["stone", "rust", "sand", "green", "gunmetal", "bone"];
    for (const f of features) {
      expect(palette, `feature ${f.type} colour`).toContain(f.color);
    }
  });
});

