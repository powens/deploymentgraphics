// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { features, makeFeatures } from "./features.js";
import { baseTheme } from "./presets/theme.js";

describe("feature draw functions", () => {
  it("registers the four feature types", () => {
    expect(Object.keys(features).sort()).toEqual([
      "generator",
      "l-ruin",
      "pipe",
      "sandbags",
    ]);
  });

  it("returns a non-empty body at canonical and odd sizes", () => {
    for (const draw of Object.values(features)) {
      expect(draw(5, 3).body.length).toBeGreaterThan(0);
      expect(draw(2.5, 7.3).body.length).toBeGreaterThan(0);
    }
  });

  it("tiles more sandbags into a bigger box", () => {
    expect(features.sandbags(2, 2).body.length).toBeLessThan(
      features.sandbags(4, 3).body.length,
    );
  });

  it("keeps the pipe path valid (no negative coords) when taller than wide", () => {
    const path = features.pipe(1.5, 4).body[0];
    if (path.tag !== "path") throw new Error("expected a path body");
    expect(path.d).not.toMatch(/-\d/);
  });
});

describe("makeFeatures", () => {
  const CANVAS = { width: 60, height: 44 };
  // Defaults to mirror:false so single-copy assertions stay unambiguous; the
  // mirror behaviour has its own test.
  const place = (over: Record<string, unknown> = {}) => ({
    type: "generator",
    x: 10,
    y: 8,
    width: 5,
    height: 3,
    color: "gunmetal",
    mirror: false,
    ...over,
  });

  it("builds a <g id=features> with one child group per placement", () => {
    const g = makeFeatures(
      [place(), place({ type: "pipe", color: "rust" })],
      baseTheme,
      CANVAS,
    );
    expect(g.getAttribute("id")).toBe("features");
    expect(g.childNodes.length).toBe(2);
  });

  it("translates and rotates around the box center", () => {
    const g = makeFeatures([place({ rotation: 30 })], baseTheme, CANVAS);
    const child = g.firstChild as SVGElement;
    expect(child.getAttribute("transform")).toBe(
      "translate(10 8) rotate(30 2.5 1.5)",
    );
  });

  it("emits a second copy point-reflected through the canvas centre", () => {
    const g = makeFeatures([place({ mirror: true, rotation: 30 })], baseTheme, CANVAS);
    expect(g.childNodes.length).toBe(2);
    const mirror = g.childNodes[1] as SVGElement;
    // x' = 60-10-5 = 45, y' = 44-8-3 = 33, rotation' = 30+180 = 210.
    expect(mirror.getAttribute("transform")).toBe(
      "translate(45 33) rotate(210 2.5 1.5)",
    );
  });

  it("omits the mirror copy when mirror is false", () => {
    const g = makeFeatures([place({ mirror: false })], baseTheme, CANVAS);
    expect(g.childNodes.length).toBe(1);
  });

  it("mirrors by default when mirror is unset", () => {
    const g = makeFeatures([place({ mirror: undefined })], baseTheme, CANVAS);
    expect(g.childNodes.length).toBe(2);
  });

  it("fills body shapes with the palette fill and accent stroke", () => {
    const g = makeFeatures([place({ color: "rust" })], baseTheme, CANVAS);
    const shape = (g.firstChild as SVGElement).firstChild as SVGElement;
    expect(shape.getAttribute("fill")).toBe(baseTheme.feature.palette.rust.fill);
    expect(shape.getAttribute("stroke")).toBe(
      baseTheme.feature.palette.rust.accent,
    );
  });

  it("throws on an unknown feature type", () => {
    expect(() =>
      makeFeatures([place({ type: "nope" })], baseTheme, CANVAS),
    ).toThrow(/unknown feature type/);
  });

  it("throws on an unknown colour", () => {
    expect(() =>
      makeFeatures([place({ color: "chartreuse" })], baseTheme, CANVAS),
    ).toThrow(/unknown feature colour/);
  });
});
