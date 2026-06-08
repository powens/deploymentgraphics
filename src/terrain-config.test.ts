import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { getLayoutBuildings, type TerrainConfig } from "./terrain-config";
import { resolveBuilding } from "./building-coordinates";

const terrain: TerrainConfig = {
  templates: { "4x6": { width: 4, height: 6 } },
  layout: {
    "1": {
      buildings: [{ type: "4x6", corners: { TL: [0, 0], TR: [4, 0] } }],
    },
  },
};

describe("getLayoutBuildings", () => {
  it("returns the building placements for an existing layout", () => {
    expect(getLayoutBuildings(terrain, "1")).toEqual([
      { type: "4x6", corners: { TL: [0, 0], TR: [4, 0] } },
    ]);
  });

  it("throws a descriptive error for a missing layout", () => {
    expect(() => getLayoutBuildings(terrain, "9")).toThrow(
      /no layout named: 9/,
    );
  });
});

// Canvas size taken from static/data/base.yml (`size:`).
const CANVAS = { width: 60, height: 44 };
const GW_YML = fileURLToPath(
  new URL("../static/data/terrain/gw.yml", import.meta.url),
);

describe("placeholder gw.yml", () => {
  const gwTerrain = yaml.load(readFileSync(GW_YML, "utf8")) as TerrainConfig;

  it("defines layout 1", () => {
    expect(Object.keys(gwTerrain.layout).sort()).toEqual(["1"]);
  });

  it("every building in every layout resolves without throwing", () => {
    for (const [name, layout] of Object.entries(gwTerrain.layout)) {
      for (const placement of layout.buildings) {
        expect(
          () => resolveBuilding(placement, gwTerrain.templates, CANVAS),
          `layout ${name}, building type ${placement.type}`,
        ).not.toThrow();
      }
    }
  });
});
