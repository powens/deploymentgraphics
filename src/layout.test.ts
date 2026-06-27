import { describe, it, expect } from "vitest";
import { resolveLayout } from "./layout";
import type { FullConfig } from "./types";

/** A FullConfig with a selected layout "1" carrying one of each piece. */
function configWith(over: Partial<FullConfig> = {}): FullConfig {
  return {
    base: {
      size: { width: 60, height: 44 },
      half_way_lines: {},
      building: {},
      grid: {},
    },
    terrain: {
      layout_name: "1",
      templates: { "4x6": { width: 4, height: 6 } },
      layout: {
        "1": {
          templates: [{ type: "4x6", corners: { TL: { x: 10, y: 0 } } }],
          icons: [{ type: "skull", pos: { x: 5, y: 5 } }],
          features: [
            { type: "l-ruin", x: 1, y: 1, width: 3, height: 3, color: "rust" },
          ],
          area_terrain: [{ shape: "circle", x: 2, y: 2 }],
        },
      },
    },
    deployment: {
      name: "Test",
      home_edge: "long",
      attacker: { deployment_zone: [] },
      defender: { deployment_zone: [] },
    },
    ...over,
  } as unknown as FullConfig;
}

describe("resolveLayout", () => {
  it("returns the selected layout's buildings and icons", () => {
    const r = resolveLayout(configWith());
    expect(r.buildings).toHaveLength(1);
    expect(r.buildings[0].type).toBe("4x6");
    expect(r.icons).toHaveLength(1);
    expect(r.icons[0].type).toBe("skull");
  });

  it("returns empty buildings and icons when no layout is selected", () => {
    const config = configWith();
    config.terrain.layout_name = "99";
    const r = resolveLayout(config);
    expect(r.buildings).toEqual([]);
    expect(r.icons).toEqual([]);
  });

  it("returns empty arrays for a selected layout that omits the optional pieces", () => {
    const config = configWith();
    config.terrain.layout["1"] = { templates: [] };
    const r = resolveLayout(config);
    expect(r.buildings).toEqual([]);
    expect(r.icons).toEqual([]);
    expect(r.features).toEqual([]);
    expect(r.areaTerrain).toEqual([]);
  });

  it("unions top-level features before the layout's features", () => {
    const config = configWith();
    config.features = [
      { type: "generator", x: 0, y: 0, width: 2, height: 2, color: "gunmetal" },
    ];
    const r = resolveLayout(config);
    // top-level first, then the layout's — order matters for draw order.
    expect(r.features.map((f) => f.type)).toEqual(["generator", "l-ruin"]);
  });

  it("unions top-level terrain area before the layout's area terrain", () => {
    const config = configWith();
    config.terrain.area_terrain = [{ shape: "polygon", x: 9, y: 9, points: [] }];
    const r = resolveLayout(config);
    expect(r.areaTerrain.map((a) => a.shape)).toEqual(["polygon", "circle"]);
  });

  it("still surfaces top-level features and area when no layout is selected", () => {
    const config = configWith();
    config.terrain.layout_name = "99";
    config.features = [
      { type: "generator", x: 0, y: 0, width: 2, height: 2, color: "gunmetal" },
    ];
    config.terrain.area_terrain = [{ shape: "circle", x: 1, y: 1 }];
    const r = resolveLayout(config);
    expect(r.features).toHaveLength(1);
    expect(r.areaTerrain).toHaveLength(1);
  });
});
