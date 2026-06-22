// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeMissionCard } from "../main.js";
import { mergeTerrain } from "../terrain-config.js";
import { buildConfig } from "./build-config.js";
import { missions } from "./missions.js";

describe("buildConfig", () => {
  it("renders every built-in mission preset", () => {
    for (const mission of Object.values(missions)) {
      const svg = makeMissionCard(buildConfig({ mission }));
      expect(svg.tagName).toBe("svg");
    }
  });

  it("applies layout and grid overrides", () => {
    const config = buildConfig({
      mission: missions.dawn_of_war,
      layout: "1",
      grid: false,
    });

    expect(config.terrain.layout_name).toBe("1");
    expect(config.base.grid.draw).toBe(false);
    expect(() => makeMissionCard(config)).not.toThrow();
  });

  // The browser app assembles its config this way — mergeTerrain feeding
  // buildConfig — and serialises the result to the raw-YAML tab, so the shape
  // is user-visible. Guard it against drift.
  it("assembles the browser app's FullConfig shape from merged terrain", () => {
    const mission = missions.dawn_of_war;
    const base = {
      size: { width: 60, height: 44 },
      half_way_lines: { draw: true },
      building: { draw: true },
      grid: { draw: false },
    };
    const terrain = mergeTerrain(
      { templates: { "4x6": { width: 4, height: 6 } } },
      { layout: { "1": { templates: [] } } },
    );

    const config = buildConfig({ mission, terrain, base, layout: "1", grid: true });

    expect(config).toEqual({
      deployment: mission,
      base: {
        size: { width: 60, height: 44 },
        half_way_lines: { draw: true },
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
