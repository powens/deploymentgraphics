// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectMissionCard, makeMissionCard } from "./main";
import type { FullConfig } from "./types";

function buildMinimalConfig(): FullConfig {
  return {
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
}

const config = buildMinimalConfig();

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


describe("makeAreaTerrain", () => {
  it("renders area terrain circle when config has area_terrain", () => {
    const cfg = buildMinimalConfig();
    cfg.terrain.area_terrain = [
      { shape: "circle", x: 10, y: 10, width: 6, label: "Forest" },
    ];
    const svg = makeMissionCard(cfg);
    const circles = svg.querySelectorAll("#area-terrain circle");
    expect(circles.length).toBe(1);
    expect(circles[0].getAttribute("cx")).toBe("13"); // x + r = 10 + 3
    expect(circles[0].getAttribute("cy")).toBe("13");
    expect(circles[0].getAttribute("r")).toBe("3");
  });

  it("renders area terrain polygon when config has area_terrain polygon", () => {
    const cfg = buildMinimalConfig();
    cfg.terrain.area_terrain = [
      {
        shape: "polygon",
        x: 5,
        y: 5,
        points: [[0, 0], [4, 0], [4, 3], [0, 3]],
        label: "Rubble",
      },
    ];
    const svg = makeMissionCard(cfg);
    const polygons = svg.querySelectorAll("#area-terrain polygon");
    expect(polygons.length).toBe(1);
    expect(polygons[0].getAttribute("points")).toBe("5,5 9,5 9,8 5,8");
  });

  it("skips area terrain group when terrain has no area_terrain", () => {
    const cfg = buildMinimalConfig();
    const svg = makeMissionCard(cfg);
    const group = svg.querySelector("#area-terrain");
    expect(group).toBeNull();
  });
});

describe("makeAnnotations", () => {
  it("renders text annotation when config has annotations", () => {
    const config = buildMinimalConfig();
    config.annotations = [{ kind: "text", x: 20, y: 22, text: "Alpha" }];
    const svg = makeMissionCard(config);
    const texts = svg.querySelectorAll("#annotations text");
    expect(texts.length).toBe(1);
    expect(texts[0].textContent).toBe("Alpha");
    expect(texts[0].getAttribute("x")).toBe("20");
  });

  it("renders arrow annotation as line with marker", () => {
    const config = buildMinimalConfig();
    config.annotations = [
      { kind: "arrow", x: 10, y: 10, endX: 20, endY: 20 },
    ];
    const svg = makeMissionCard(config);
    const lines = svg.querySelectorAll("#annotations line");
    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute("x1")).toBe("10");
    expect(lines[0].getAttribute("y2")).toBe("20");
    expect(lines[0].getAttribute("marker-end")).toBe("url(#arrowhead)");
    expect(svg.querySelector("defs #arrowhead")).not.toBeNull();
  });

  it("skips annotations group when config has no annotations", () => {
    const config = buildMinimalConfig();
    const svg = makeMissionCard(config);
    expect(svg.querySelector("#annotations")).toBeNull();
  });
});

describe("makeDeploymentZone rendering", () => {
  it("renders a polygon when mask_center is absent", () => {
    const config = buildMinimalConfig();
    config.deployment = {
      name: "Test",
      home_edge: "long",
      attacker: { deployment_zone: [[60,0],[60,22],[30,22],[30,0]] },
      defender: { deployment_zone: [[30,22],[30,44],[0,44],[0,22]] },
    };
    const svg = makeMissionCard(config);
    const attacker = svg.querySelector("#attacker");
    expect(attacker?.tagName).toBe("polygon");
  });

  it("renders an evenodd path when mask_center is set", () => {
    const config = buildMinimalConfig();
    config.deployment = {
      name: "Test",
      home_edge: "long",
      attacker: { deployment_zone: [[60,0],[60,22],[30,22],[30,0]], mask_center: 9 },
      defender: { deployment_zone: [[30,22],[30,44],[0,44],[0,22]], mask_center: 9 },
    };
    const svg = makeMissionCard(config);
    const attacker = svg.querySelector("#attacker");
    expect(attacker?.tagName).toBe("path");
    expect(attacker?.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("does not create a centerMask element when mask_center is set", () => {
    const config = buildMinimalConfig();
    config.deployment = {
      name: "Test",
      home_edge: "long",
      attacker: { deployment_zone: [[60,0],[60,22],[30,22],[30,0]], mask_center: 9 },
      defender: { deployment_zone: [[30,22],[30,44],[0,44],[0,22]], mask_center: 9 },
    };
    const svg = makeMissionCard(config);
    expect(svg.querySelector("#centerMask")).toBeNull();
  });
});
