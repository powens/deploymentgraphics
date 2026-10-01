// @vitest-environment happy-dom
import { describe, expect, expectTypeOf, it } from "vitest";
import { makeMissionCard } from "../main.js";
import { baseConfig } from "./base.js";
import { buildConfig, type BuildConfigOptions } from "./build-config.js";
import type { LayoutId } from "./terrain-index.js";
import { missions } from "./missions.js";
import { gwTerrain } from "./terrain.js";

describe("buildConfig", () => {
  it("renders every built-in mission preset", () => {
    for (const mission of Object.values(missions)) {
      const svg = makeMissionCard(buildConfig({ mission }));
      expect(svg.tagName).toBe("svg");
    }
  });

  it("applies layout, grid, and territory overrides", () => {
    const config = buildConfig({
      mission: missions.dawn_of_war,
      terrain: { templates: {}, layout: { "1": { templates: [] } } },
      layout: "1",
      grid: false,
      territory: false,
    });

    expect(config.terrain.layout_name).toBe("1");
    expect(config.base.grid.draw).toBe(false);
    expect(config.base.territory.draw).toBe(false);
    expect(() => makeMissionCard(config)).not.toThrow();
  });

  // Not `gwTerrain`, so `buildConfig` doesn't pull the corpus into bundles.
  it("defaults to an empty terrain config", () => {
    const config = buildConfig({ mission: missions.dawn_of_war });
    expect(config.terrain).toEqual({ templates: {}, layout: {}, layout_name: "" });
  });

  it("draws the built-in corpus when gwTerrain is passed explicitly", () => {
    const layout = Object.keys(gwTerrain.layout)[0];
    const config = buildConfig({ mission: missions.dawn_of_war, terrain: gwTerrain, layout });
    expect(config.terrain.layout[layout]).toBe(gwTerrain.layout[layout]);
  });

  it("throws on a layout id the terrain does not define", () => {
    expect(() =>
      buildConfig({ mission: missions.dawn_of_war, terrain: gwTerrain, layout: "bm-nope" }),
    ).toThrow('unknown layout "bm-nope": not a key of terrain.layout');
  });

  // The 0.x default terrain was the corpus; a layout with no terrain was the
  // silent-bare-board trap.
  it("hints at gwTerrain when a layout is named without terrain", () => {
    expect(() =>
      buildConfig({ mission: missions.dawn_of_war, layout: "bm-take-vs-take-02" }),
    ).toThrow(/terrain\.layout is empty; pass the terrain that defines it \(e\.g\. terrain: gwTerrain\)/);
  });

  it("accepts the empty layout id without terrain", () => {
    expect(buildConfig({ mission: missions.dawn_of_war, layout: "" }).terrain.layout_name).toBe("");
  });

  it("types layout as a LayoutId, still open to custom ids", () => {
    expectTypeOf<"bm-take-vs-take-02">().toMatchTypeOf<LayoutId>();
    expectTypeOf<LayoutId>().toMatchTypeOf<NonNullable<BuildConfigOptions["layout"]>>();
    expectTypeOf<"my-own-layout">().toMatchTypeOf<NonNullable<BuildConfigOptions["layout"]>>();
  });

  it("leaves base untouched when no override is passed", () => {
    const config = buildConfig({ mission: missions.dawn_of_war });
    expect(config.base).toBe(baseConfig);
  });

  // The viewer's raw-YAML tab shows this shape, so it is user-visible.
  it("assembles the browser app's FullConfig shape from a terrain config", () => {
    const mission = missions.dawn_of_war;
    const base = {
      size: { width: 60, height: 44 },
      half_way_lines: { draw: true },
      territory: { draw: true },
      building: { draw: true },
      grid: { draw: false },
    };
    const terrain = {
      templates: { "4x6": { width: 4, height: 6 } },
      layout: { "1": { templates: [] } },
    };

    const config = buildConfig({ mission, terrain, base, layout: "1", grid: true });

    expect(config).toEqual({
      deployment: mission,
      base: {
        size: { width: 60, height: 44 },
        half_way_lines: { draw: true },
        territory: { draw: true },
        building: { draw: true },
        grid: { draw: true },
      },
      terrain: {
        templates: { "4x6": { width: 4, height: 6 } },
        layout: { "1": { templates: [] } },
        layout_name: "1",
      },
    });
  });
});
