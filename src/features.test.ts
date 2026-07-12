// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { features, injectFeatureDefs, makeFeatures } from "./features.js";
import { baseTheme } from "./presets/theme.js";

describe("feature draw functions", () => {
  it("registers the seven feature types", () => {
    expect(Object.keys(features).sort()).toEqual([
      "gantry",
      "generator",
      "l-ruin",
      "l-ruin-mirror",
      "l-ruin-roof",
      "l-ruin-roof-mirror",
      "pipe",
    ]);
  });

  it("draws the gantry as a deck body plus brace + post accents", () => {
    const art = features.gantry(2, 2);
    expect(art.body).toEqual([{ tag: "rect", x: 0, y: 0, width: 2, height: 2 }]);
    // Two diagonal brace beams (paths) + four corner posts (circles).
    expect(art.accent.filter((s) => s.tag === "path").length).toBe(2);
    expect(art.accent.filter((s) => s.tag === "circle").length).toBe(4);
  });

  it("mirrors l-ruin geometry across x = w/2", () => {
    const w = 6;
    const h = 4;
    const base = features["l-ruin"](w, h).body[0];
    const mir = features["l-ruin-mirror"](w, h).body[0];
    if (base.tag !== "path" || mir.tag !== "path") {
      throw new Error("expected path bodies");
    }
    // The base L walls the left+bottom edges (outer corner bottom-left); the
    // mirror walls the right+bottom edges (outer corner bottom-right). The wall
    // thickness is the same, so the mirror path mentions w - wall where the base
    // mentions wall.
    const wall = Math.min(0.5, w, h);
    expect(base.d).toContain(`H${wall}`);
    expect(mir.d).toContain(`H${w - wall}`);
  });

  it("gives the roof-mirror the same wall outline as l-ruin-mirror", () => {
    const w = 5;
    const h = 7;
    const ruin = features["l-ruin-mirror"](w, h);
    const roof = features["l-ruin-roof-mirror"](w, h);
    // The roof variant adds the slab + beam on top of the same two walls.
    expect(roof.body[0]).toEqual(ruin.body[0]);
    expect(roof.body.length).toBe(ruin.body.length + 1);
  });

  it("returns a non-empty body at canonical and odd sizes", () => {
    for (const draw of Object.values(features)) {
      expect(draw(5, 3).body.length).toBeGreaterThan(0);
      expect(draw(2.5, 7.3).body.length).toBeGreaterThan(0);
    }
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

  it("builds a <g id=features> with one <use> per placement", () => {
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

  it("references the shape def and sets palette colours as custom properties", () => {
    const g = makeFeatures([place({ color: "rust" })], baseTheme, CANVAS);
    const use = g.firstChild as SVGElement;
    expect(use.tagName.toLowerCase()).toBe("use");
    expect(use.getAttribute("href")).toBe("#feature-generator-5x3");
    expect(use.getAttribute("style")).toBe(
      `--body:${baseTheme.feature.palette.rust.fill};` +
        `--accent:${baseTheme.feature.palette.rust.accent}`,
    );
  });

  it("sets the shared stroke-width once on the group", () => {
    const g = makeFeatures([place()], baseTheme, CANVAS);
    expect(g.getAttribute("stroke-width")).toBe(
      `${baseTheme.feature.stroke_width}`,
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

describe("injectFeatureDefs", () => {
  const svgDefs = () =>
    document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const place = (over: Record<string, unknown> = {}) => ({
    type: "generator",
    x: 0,
    y: 0,
    width: 3,
    height: 4,
    color: "gunmetal",
    ...over,
  });

  it("emits one def per distinct (type, width, height)", () => {
    const defs = svgDefs();
    injectFeatureDefs(
      [
        place(),
        place({ x: 9, color: "rust" }), // same shape, different colour/pos
        place({ type: "gantry", width: 2, height: 2 }),
      ],
      defs,
    );
    expect(defs.childNodes.length).toBe(2);
    expect(defs.querySelector("#feature-generator-3x4")).not.toBeNull();
    expect(defs.querySelector("#feature-gantry-2x2")).not.toBeNull();
  });

  it("sanitizes decimal dimensions in the def id", () => {
    const defs = svgDefs();
    injectFeatureDefs(
      [place({ type: "l-ruin", width: 4.5, height: 5 })],
      defs,
    );
    expect(defs.querySelector("#feature-l-ruin-4_5x5")).not.toBeNull();
  });

  it("emits colour-free geometry styled with custom-property vars", () => {
    const defs = svgDefs();
    injectFeatureDefs([place({ width: 5, height: 3 })], defs);
    const def = defs.querySelector("#feature-generator-5x3")!;
    const body = def.firstChild as SVGElement;
    expect(body.getAttribute("style")).toBe(
      "fill:var(--body);stroke:var(--accent)",
    );
    expect(body.getAttribute("fill")).toBeNull(); // no baked colour
    const accent = def.lastChild as SVGElement;
    expect(accent.getAttribute("style")).toBe("fill:var(--accent)");
  });

  it("throws on an unknown feature type", () => {
    const defs = svgDefs();
    expect(() =>
      injectFeatureDefs([place({ type: "nope" })], defs),
    ).toThrow(/unknown feature type/);
  });
});
