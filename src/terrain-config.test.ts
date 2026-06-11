import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  getLayoutBuildings,
  getLayoutFeatures,
  getLayoutIcons,
  getLayoutAreaTerrain,
  type TerrainConfig,
} from "./terrain-config";
import { resolveBuilding } from "./building-coordinates";

const terrain: TerrainConfig = {
  templates: { "4x6": { width: 4, height: 6 } },
  layout: {
    "1": {
      buildings: [{ type: "4x6", corners: { TL: { x: 0, y: 0 }, TR: { x: 4, y: 0 } } }],
    },
  },
};

describe("getLayoutBuildings", () => {
  it("returns the building placements for an existing layout", () => {
    expect(getLayoutBuildings(terrain, "1")).toEqual([
      { type: "4x6", corners: { TL: { x: 0, y: 0 }, TR: { x: 4, y: 0 } } },
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

describe("getLayoutIcons", () => {
  const t: TerrainConfig = {
    templates: {},
    layout: {
      "1": { buildings: [], icons: [{ type: "skull", pos: { x: 5, y: 10 } }] },
      "2": { buildings: [] },
    },
  };

  it("returns the icon placements for a layout that has them", () => {
    expect(getLayoutIcons(t, "1")).toEqual([{ type: "skull", pos: { x: 5, y: 10 } }]);
  });

  it("returns [] for a layout with no icons", () => {
    expect(getLayoutIcons(t, "2")).toEqual([]);
  });

  it("returns [] for a missing layout", () => {
    expect(getLayoutIcons(t, "9")).toEqual([]);
  });

  it("preserves a player tag on an icon placement", () => {
    const tp: TerrainConfig = {
      templates: {},
      layout: {
        "1": { buildings: [], icons: [{ type: "fortress", pos: { x: 5, y: 10 }, player: "attacker" }] },
      },
    };
    expect(getLayoutIcons(tp, "1")).toEqual([
      { type: "fortress", pos: { x: 5, y: 10 }, player: "attacker" },
    ]);
  });
});

describe("getLayoutFeatures", () => {
  const feature = {
    type: "pipe",
    x: 5,
    y: 10,
    width: 6,
    height: 2,
    color: "rust",
  };
  const t: TerrainConfig = {
    templates: {},
    layout: {
      "1": { buildings: [], features: [feature] },
      "2": { buildings: [] },
    },
  };

  it("returns the feature placements for a layout that has them", () => {
    expect(getLayoutFeatures(t, "1")).toEqual([feature]);
  });

  it("returns [] for a layout with no features", () => {
    expect(getLayoutFeatures(t, "2")).toEqual([]);
  });

  it("returns [] for a missing layout", () => {
    expect(getLayoutFeatures(t, "9")).toEqual([]);
  });
});

const terrainWithExtras = {
  templates: {},
  layout: {
    a: {
      buildings: [],
      area_terrain: [
        { shape: "polygon", x: 0, y: 0, points: [{ x: 1, y: 1 }], label: "feature" },
      ],
    },
    bare: { buildings: [] },
  },
} as unknown as TerrainConfig;

describe("getLayoutAreaTerrain", () => {
  it("returns a layout's area terrain", () => {
    expect(getLayoutAreaTerrain(terrainWithExtras, "a")).toHaveLength(1);
  });
  it("returns [] for a layout without area terrain", () => {
    expect(getLayoutAreaTerrain(terrainWithExtras, "bare")).toEqual([]);
  });
  it("returns [] for a missing layout", () => {
    expect(getLayoutAreaTerrain(terrainWithExtras, "nope")).toEqual([]);
  });
});
