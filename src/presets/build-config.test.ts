// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeMissionCard } from "../main.js";
import { buildConfig } from "./build-config.js";
import { missions } from "./missions.js";

describe("buildConfig", () => {
  it("renders every built-in mission preset", () => {
    for (const mission of Object.values(missions)) {
      const svg = makeMissionCard(buildConfig({ mission }));
      expect(svg.tagName).toBe("svg");
    }
  });

  it("applies layout, grid, and hidden-supplies overrides", () => {
    const config = buildConfig({
      mission: missions.dawn_of_war,
      layout: "1",
      grid: false,
      hiddenSupplies: true,
    });

    expect(config.terrain.layout_name).toBe("1");
    expect(config.base.grid.draw).toBe(false);
    expect(config.deployment.hidden_supplies).toBe(true);
    expect(() => makeMissionCard(config)).not.toThrow();
  });

  it("does not mutate the shared preset objects", () => {
    buildConfig({ mission: missions.dawn_of_war, grid: false });

    expect(missions.dawn_of_war.hidden_supplies).toBeUndefined();
  });
});
