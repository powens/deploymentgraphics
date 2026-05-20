// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectMissionCard, makeMissionCard } from "./main";
import type { FullConfig } from "./types";

const config = {
  base: {
    size: { width: 60, height: 44 },
    background: { fill: "black" },
    half_way_lines: { draw: true, svg_properties: { stroke: "black" } },
    deployment: {
      attacker: { svg_properties: { fill: "#cf4b33", stroke: "none" } },
      defender: { svg_properties: { fill: "#7d8b7f", stroke: "none" } },
    },
    building: {
      draw: true,
      svg_properties: { opacity: 1 },
      template: { fill: "#808080", stroke: "black" },
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
  },
} as unknown as FullConfig;

describe("makeMissionCard", () => {
  it("returns an <svg> with the expected layers", () => {
    const svg = makeMissionCard(config);
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelectorAll("polygon").length).toBe(2); // deployment zones
    expect(svg.querySelector("#buildings")).not.toBeNull();
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

describe("makeHalfwayLines draw flag", () => {
  it("draws the two halfway lines by default", () => {
    const svg = makeMissionCard(config);
    expect(svg.querySelectorAll("line").length).toBe(2);
  });

  it("omits the halfway lines when half_way_lines.draw is false", () => {
    const noLines = {
      ...config,
      base: {
        ...config.base,
        half_way_lines: { ...config.base.half_way_lines, draw: false },
      },
    } as FullConfig;
    const svg = makeMissionCard(noLines);
    expect(svg.querySelectorAll("line").length).toBe(0);
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
    expect(svg.querySelector("#attacker")?.getAttribute("fill")).toBe(
      "#cf4b33",
    );
    expect(svg.querySelector("#defender")?.getAttribute("fill")).toBe(
      "#7d8b7f",
    );
  });

  it("passes a 'none' stroke through unchanged (not '#none')", () => {
    const svg = makeMissionCard(config);
    for (const zone of svg.querySelectorAll("polygon")) {
      expect(zone.getAttribute("stroke")).toBe("none");
    }
  });

  it("takes the deployment-zone stroke-width from config", () => {
    const widened = {
      ...config,
      base: {
        ...config.base,
        deployment: {
          attacker: {
            svg_properties: { fill: "#cf4b33", stroke: "none", stroke_width: 0.6 },
          },
          defender: {
            svg_properties: { fill: "#7d8b7f", stroke: "none", stroke_width: 0.6 },
          },
        },
      },
    } as FullConfig;
    const svg = makeMissionCard(widened);
    expect(svg.querySelector("#attacker")?.getAttribute("stroke-width")).toBe(
      "0.6",
    );
    expect(svg.querySelector("#defender")?.getAttribute("stroke-width")).toBe(
      "0.6",
    );
  });
});

describe("injectCenterMask", () => {
  const masked = {
    ...config,
    deployment: {
      ...config.deployment,
      attacker: { ...config.deployment.attacker, mask_center: 6 },
    },
  } as FullConfig;

  it("sizes the mask circle from the mask_center value", () => {
    const svg = makeMissionCard(masked);
    const circle = svg.querySelector("defs #centerMask circle");
    expect(circle?.getAttribute("r")).toBe("6");
  });

  it("appends the center mask inside <defs>, not as a direct <svg> child", () => {
    const svg = makeMissionCard(masked);
    expect(svg.querySelector("defs #centerMask")).not.toBeNull();
    const directMask = Array.from(svg.children).find(
      (c) => c.tagName.toLowerCase() === "mask",
    );
    expect(directMask).toBeUndefined();
  });

  it("omits the center mask when no player masks the centre", () => {
    const svg = makeMissionCard(config);
    expect(svg.querySelector("#centerMask")).toBeNull();
  });
});
