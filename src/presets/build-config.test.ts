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
});
