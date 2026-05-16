import { describe, it, expect } from "vitest";
import { getLayoutBuildings, type TerrainConfig } from "./terrain-config";

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
