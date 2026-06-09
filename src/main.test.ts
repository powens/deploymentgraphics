// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectMissionCard, makeMissionCard } from "./main";
import { baseTheme } from "./presets/theme.js";
import type { FullConfig } from "./types";

function buildMinimalConfig(): FullConfig {
  return {
    base: {
      size: { width: 60, height: 44 },
      half_way_lines: { draw: true },
      building: { draw: true },
      grid: { draw: false },
    },
    terrain: {
      layout_name: "1",
      templates: { "4x6": { width: 4, height: 6 } },
      layout: {
        "1": {
          buildings: [{ type: "4x6", corners: { TL: { x: 10, y: 0 }, TR: { x: 14, y: 0 } } }],
        },
      },
    },
    deployment: {
      name: "Test",
      home_edge: "long",
      attacker: { deployment_zone: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 10 }] },
      defender: { deployment_zone: [{ x: 0, y: 44 }, { x: 60, y: 44 }, { x: 60, y: 34 }] },
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

  it("takes the deployment-zone stroke-width from the theme", () => {
    const theme = structuredClone(baseTheme);
    theme.deployment.attacker.stroke_width = 0.6;
    theme.deployment.defender.stroke_width = 0.6;
    const svg = makeMissionCard(config, theme);
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
        points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
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

  it("falls back to area_terrain.default for an unknown label", () => {
    const cfg = buildMinimalConfig();
    cfg.terrain.area_terrain = [
      { shape: "circle", x: 0, y: 0, width: 6, label: "Nonexistent" },
    ];
    const svg = makeMissionCard(cfg);
    expect(
      svg.querySelector("#area-terrain circle")?.getAttribute("fill"),
    ).toBe("rgba(140,130,120,0.2)");
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

  it("applies the text-outline stroke to a text annotation", () => {
    const cfg = buildMinimalConfig();
    cfg.annotations = [{ kind: "text", x: 1, y: 1, text: "X" }];
    const svg = makeMissionCard(cfg);
    const el = svg.querySelector("#annotations text");
    expect(el?.getAttribute("stroke")).toBe("white");
    expect(el?.getAttribute("stroke-width")).toBe("0.3");
    expect(el?.getAttribute("paint-order")).toBe("stroke");
  });

  it("applies the arrow stroke from the theme", () => {
    const cfg = buildMinimalConfig();
    cfg.annotations = [{ kind: "arrow", x: 0, y: 0, endX: 5, endY: 5 }];
    const svg = makeMissionCard(cfg);
    const line = svg.querySelector("#annotations line");
    expect(line?.getAttribute("stroke")).toBe("black");
    expect(line?.getAttribute("stroke-width")).toBe("0.4");
  });
});

describe("makeFeatures integration", () => {
  it("renders a features group on top of buildings", () => {
    const config = buildMinimalConfig();
    config.features = [
      { type: "generator", x: 10, y: 8, width: 5, height: 3, color: "gunmetal" },
    ];
    const svg = makeMissionCard(config);
    const featuresGroup = svg.querySelector("#features");
    expect(featuresGroup).not.toBeNull();
    expect(featuresGroup!.childNodes.length).toBe(1);

    // Features must come after the buildings group in document order.
    const ids = [...svg.children].map((c) => c.getAttribute("id"));
    expect(ids.indexOf("features")).toBeGreaterThan(ids.indexOf("buildings"));
  });

  it("renders no features group when none are present", () => {
    const svg = makeMissionCard(buildMinimalConfig());
    expect(svg.querySelector("#features")).toBeNull();
  });

  it("renders features declared in the selected layout", () => {
    const config = buildMinimalConfig();
    config.terrain.layout["1"].features = [
      { type: "sandbags", x: 5, y: 5, width: 2, height: 2, color: "sand" },
    ];
    const svg = makeMissionCard(config);
    expect(svg.querySelector("#features")!.childNodes.length).toBe(1);
  });

  it("merges top-level features with the layout's features", () => {
    const config = buildMinimalConfig();
    config.features = [
      { type: "generator", x: 1, y: 1, width: 5, height: 3, color: "gunmetal" },
    ];
    config.terrain.layout["1"].features = [
      { type: "sandbags", x: 5, y: 5, width: 2, height: 2, color: "sand" },
    ];
    const svg = makeMissionCard(config);
    expect(svg.querySelector("#features")!.childNodes.length).toBe(2);
  });
});

describe("makeObjectives", () => {
  it("renders a numbered marker per objective", () => {
    const cfg = buildMinimalConfig();
    cfg.objectives = [
      { x: 30, y: 22, number: 1 },
      { x: 15, y: 10, number: 2 },
    ];
    const svg = makeMissionCard(cfg);
    const markers = svg.querySelectorAll("#objectives circle");
    expect(markers.length).toBe(2);
    expect(markers[0].getAttribute("cx")).toBe("30");
    expect(markers[0].getAttribute("cy")).toBe("22");
    const labels = svg.querySelectorAll("#objectives text");
    expect(labels.length).toBe(2);
    expect([...labels].map((t) => t.textContent)).toEqual(["1", "2"]);
  });

  it("skips the objectives group when config has no objectives", () => {
    const cfg = buildMinimalConfig();
    const svg = makeMissionCard(cfg);
    expect(svg.querySelector("#objectives")).toBeNull();
  });

  it("styles objective markers from the theme", () => {
    const cfg = buildMinimalConfig();
    cfg.objectives = [{ x: 30, y: 22, number: 1 }];
    const svg = makeMissionCard(cfg);
    expect(svg.querySelector("#objectives circle")?.getAttribute("fill")).toBe(
      "#1a1a1a",
    );
  });
});

describe("makeDeploymentZone rendering", () => {
  it("renders a polygon when mask_center is absent", () => {
    const config = buildMinimalConfig();
    config.deployment = {
      name: "Test",
      home_edge: "long",
      attacker: { deployment_zone: [{ x: 60, y: 0 }, { x: 60, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 0 }] },
      defender: { deployment_zone: [{ x: 30, y: 22 }, { x: 30, y: 44 }, { x: 0, y: 44 }, { x: 0, y: 22 }] },
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
      attacker: { deployment_zone: [{ x: 60, y: 0 }, { x: 60, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 0 }], mask_center: 9 },
      defender: { deployment_zone: [{ x: 30, y: 22 }, { x: 30, y: 44 }, { x: 0, y: 44 }, { x: 0, y: 22 }], mask_center: 9 },
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
      attacker: { deployment_zone: [{ x: 60, y: 0 }, { x: 60, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 0 }], mask_center: 9 },
      defender: { deployment_zone: [{ x: 30, y: 22 }, { x: 30, y: 44 }, { x: 0, y: 44 }, { x: 0, y: 22 }], mask_center: 9 },
    };
    const svg = makeMissionCard(config);
    expect(svg.querySelector("#centerMask")).toBeNull();
  });
});
