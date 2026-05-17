// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectObjectiveDefs, makeObjectives } from "./objectives";
import type { FullConfig } from "./types";

const config = {
  base: {
    size: { width: 60, height: 44 },
    objective: {
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

  it("omits the real circle when objective.real.draw is false", () => {
    const noReal = {
      ...config,
      base: {
        ...config.base,
        objective: {
          ...config.base.objective,
          real: { ...config.base.objective.real, draw: false },
        },
      },
    } as unknown as FullConfig;
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectObjectiveDefs(defs, noReal);
    const circles = defs.querySelector("#objMarker")!.querySelectorAll("circle");
    expect(circles.length).toBe(1);
    expect(circles[0].getAttribute("r")).toBe("3.79"); // influence ring only
  });

  it("throws when objective.real.radius is falsy", () => {
    const noRadius = {
      ...config,
      base: {
        ...config.base,
        objective: {
          ...config.base.objective,
          real: { ...config.base.objective.real, radius: 0 },
        },
      },
    } as unknown as FullConfig;
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    expect(() => injectObjectiveDefs(defs, noRadius)).toThrow(/real radius/i);
  });

  it("omits the influence ring when objective.influence.draw is false", () => {
    const noInfluence = {
      ...config,
      base: {
        ...config.base,
        objective: {
          ...config.base.objective,
          influence: { ...config.base.objective.influence, draw: false },
        },
      },
    } as unknown as FullConfig;
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectObjectiveDefs(defs, noInfluence);
    const circles = defs.querySelector("#objMarker")!.querySelectorAll("circle");
    expect(circles.length).toBe(1);
    expect(circles[0].getAttribute("r")).toBe("0.79"); // real marker only
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
