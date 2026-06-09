// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { objectBounds, renderOverlay, createOverlaySvg } from "./overlay.js";
import { emptyScene } from "./scene.js";
import type { FeatureObject } from "./scene.js";

describe("objectBounds for features", () => {
  it("uses the feature's width and height", () => {
    const obj: FeatureObject = {
      id: "f1",
      type: "feature",
      featureType: "generator",
      x: 4,
      y: 9,
      width: 5,
      height: 3,
      rotation: 0,
      color: "gunmetal",
    };
    expect(objectBounds(obj, {})).toEqual({ x: 4, y: 9, w: 5, h: 3 });
  });
});

describe("renderOverlay rotation for features", () => {
  it("rotates a feature's overlay about its box center, matching the renderer", () => {
    const scene = emptyScene();
    scene.objects.push({
      id: "f1",
      type: "feature",
      featureType: "generator",
      x: 4,
      y: 9,
      width: 5,
      height: 3,
      rotation: 45,
      color: "gunmetal",
    });
    const svg = createOverlaySvg(scene.boardWidth, scene.boardHeight);
    renderOverlay(svg, scene, { selectedId: null, vertexEditId: null }, {});
    // Center of a 5×3 box at (4,9) is (6.5, 10.5) — must match features.ts.
    const wrapper = svg.querySelector("g[transform]");
    expect(wrapper?.getAttribute("transform")).toBe("rotate(45, 6.5, 10.5)");
  });
});
