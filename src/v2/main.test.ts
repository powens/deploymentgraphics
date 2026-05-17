// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectMissionCard, makeMissionCard } from "./main";
import type { FullConfig } from "./types";

const config = {
  base: {
    size: { width: 60, height: 44 },
    background: { fill: "black" },
    half_way_lines: { draw: true, svg_properties: { stroke: "black" } },
    objective: {
      guides: { line: { draw: false, svg_properties: {} } },
      real: { radius: 0.79, svg_properties: { fill: "red" } },
      influence: { radius: 3, svg_properties: { fill: "black" } },
    },
    deployment: {
      attacker: { svg_properties: { fill: "#cf4b33", stroke: "none" } },
      defender: { svg_properties: { fill: "#7d8b7f", stroke: "none" } },
    },
    building: {
      draw: true,
      svg_properties: { opacity: 1 },
      template: { fill: "#808080", stroke: "black" },
      structure: {},
    },
    grid: { draw: false, svg_properties: {} },
  },
  terrain: {
    layout_name: "1",
    templates: { "4x6": { width: 4, height: 6 } },
    layout: {
      "1": {
        buildings: [{ type: "4x6", corners: { TL: [10, 0], TR: [14, 0] } }],
      },
    },
  },
  deployment: {
    name: "Test",
    home_edge: "long",
    attacker: { deployment_zone: [[0, 0], [60, 0], [60, 10]] },
    defender: { deployment_zone: [[0, 44], [60, 44], [60, 34]] },
    objectives: [[0, 0], [20, 0]],
  },
} as unknown as FullConfig;

describe("makeMissionCard", () => {
  it("returns an <svg> with the expected layers", () => {
    const svg = makeMissionCard(config);
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelectorAll("polygon").length).toBe(2); // deployment zones
    expect(svg.querySelector("#buildings")).not.toBeNull();
    expect(svg.querySelector("defs #objMarker")).not.toBeNull();
    expect(svg.querySelector("defs #template-4x6")).not.toBeNull();
  });

  it("emits two building uses (placement + mirror)", () => {
    const svg = makeMissionCard(config);
    expect(svg.querySelectorAll("#buildings use").length).toBe(2);
  });

  it("skips buildings when the selected layout is absent", () => {
    const missing = {
      ...config,
      terrain: { ...config.terrain, layout_name: "99" },
    } as FullConfig;
    const svg = makeMissionCard(missing);
    expect(svg.querySelectorAll("#buildings use").length).toBe(0);
  });
});

describe("injectMissionCard", () => {
  it("appends the mission card to the root element", () => {
    const root = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    injectMissionCard(root, config);
    expect(root.querySelector("svg")).not.toBeNull();
  });
});

describe("makeDeploymentZone styling", () => {
  it("uses deployment colors verbatim with no '#' doubling", () => {
    const svg = makeMissionCard(config);
    const zones = svg.querySelectorAll("polygon");
    expect(zones[0].getAttribute("fill")).toBe("#cf4b33");
    expect(zones[1].getAttribute("fill")).toBe("#7d8b7f");
  });

  it("passes a 'none' stroke through unchanged (not '#none')", () => {
    const svg = makeMissionCard(config);
    for (const zone of svg.querySelectorAll("polygon")) {
      expect(zone.getAttribute("stroke")).toBe("none");
    }
  });
});

describe("injectCenterMask placement", () => {
  it("appends the center mask inside <defs>", () => {
    const svg = makeMissionCard(config);
    expect(svg.querySelector("defs #centerMask")).not.toBeNull();
  });

  it("does not append the mask as a direct child of <svg>", () => {
    const svg = makeMissionCard(config);
    const directMask = Array.from(svg.children).find(
      (c) => c.tagName.toLowerCase() === "mask",
    );
    expect(directMask).toBeUndefined();
  });
});
