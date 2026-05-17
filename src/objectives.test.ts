// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectObjectiveDefs, makeObjectives } from "./objectives";
import type { FullConfig } from "./types";

const config = {
  base: {
    size: { width: 60, height: 44 },
    objective: {
      guides: { line: { draw: false, svg_properties: {} } },
      real: { radius: 0.79, svg_properties: { fill: "red" } },
      influence: { radius: 3, svg_properties: { fill: "black" } },
    },
  },
  deployment: { objectives: [[0, 0], [20, 0], [-20, 0]] },
} as unknown as FullConfig;

describe("injectObjectiveDefs", () => {
  it("adds an #objMarker group to defs", () => {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectObjectiveDefs(defs, config);
    expect(defs.querySelector("#objMarker")).not.toBeNull();
  });

  it("builds the marker from an influence ring and a real circle", () => {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectObjectiveDefs(defs, config);
    const circles = defs.querySelector("#objMarker")!.querySelectorAll("circle");
    expect(circles.length).toBe(2);
    expect(circles[0].getAttribute("r")).toBe("3.79"); // influence ring (influence + real)
    expect(circles[1].getAttribute("r")).toBe("0.79"); // real marker
  });
});

describe("makeObjectives", () => {
  it("emits one <use> per objective", () => {
    const group = makeObjectives(config);
    expect(group.querySelectorAll("use").length).toBe(3);
  });

  it("emits two <use> elements for a hidden-supplies centre objective", () => {
    const hiddenConfig = {
      ...config,
      deployment: { objectives: [[30, 22]], hidden_supplies: true },
    } as unknown as FullConfig;
    const group = makeObjectives(hiddenConfig);
    expect(group.querySelectorAll("use").length).toBe(2);
  });
});
