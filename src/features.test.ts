// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { featureLayer, features } from "./features.js";
import type { FeaturePlacement } from "./terrain-config.js";
import { baseTheme } from "./presets/theme.js";
import { browserSvgDocument, type SvgNode } from "./svg-backend.js";

const doc = browserSvgDocument();
// The browser backend's `SvgNode`s are real DOM nodes.
const asElement = (node: SvgNode) => node as unknown as SVGElement;
const CANVAS = { width: 60, height: 44 };

/** Renders the layer's defs and its node together, as the card does. */
function render(placements: FeaturePlacement[]) {
  const layer = featureLayer(placements, baseTheme, CANVAS);
  const defs = doc.createElement("defs");
  layer.injectDefs?.(doc, defs);
  return { layer, defs: asElement(defs), g: asElement(layer.draw(doc)) };
}

/** Every `<use>` in `g` names a def in `defs`. */
function expectHrefsResolve(defs: SVGElement, g: SVGElement): void {
  const uses = [...g.querySelectorAll("use")];
  expect(uses.length).toBeGreaterThan(0);
  for (const use of uses) {
    const href = use.getAttribute("href")!;
    expect(href.startsWith("#")).toBe(true);
    expect(defs.querySelector(`[id="${href.slice(1)}"]`)).not.toBeNull();
  }
}

describe("feature draw functions", () => {
  it("registers the four feature types", () => {
    expect(Object.keys(features).sort()).toEqual([
      "gantry",
      "generator",
      "l-ruin",
      "l-ruin-mirror",
    ]);
  });

  it("draws the gantry as a deck body plus brace + post accents", () => {
    const art = features.gantry(2, 2);
    expect(art.body).toEqual([{ tag: "rect", x: 0, y: 0, width: 2, height: 2 }]);
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
    // Same wall thickness, so the mirror says w - wall where the base says wall.
    const wall = Math.min(0.5, w, h);
    expect(base.d).toContain(`H${wall}`);
    expect(mir.d).toContain(`H${w - wall}`);
  });

  it("returns a non-empty body at canonical and odd sizes", () => {
    for (const draw of Object.values(features)) {
      expect(draw(5, 3).body.length).toBeGreaterThan(0);
      expect(draw(2.5, 7.3).body.length).toBeGreaterThan(0);
    }
  });

});

describe("featureLayer", () => {
  // mirror:false by default so single-copy assertions are unambiguous.
  const place = (over: Partial<FeaturePlacement> = {}): FeaturePlacement => ({
    type: "generator",
    x: 10,
    y: 8,
    width: 5,
    height: 3,
    color: "gunmetal",
    mirror: false,
    ...over,
  });

  it("draws only when there are placements", () => {
    expect(featureLayer([], baseTheme, CANVAS).draws).toBe(false);
    expect(featureLayer([place()], baseTheme, CANVAS).draws).toBe(true);
  });

  it("references a def for every <use>, mirror copies included", () => {
    const { defs, g } = render([
      place(),
      place({ mirror: true, type: "l-ruin", width: 4.5 }),
      place({ type: "gantry", width: 2, height: 2, color: "indigo" }),
    ]);
    expect(g.childNodes.length).toBe(4);
    expectHrefsResolve(defs, g);
  });

  it("builds a <g id=features> with one <use> per placement", () => {
    const { g } = render([place(), place({ type: "gantry", color: "indigo" })]);
    expect(g.getAttribute("id")).toBe("features");
    expect(g.childNodes.length).toBe(2);
  });

  it("numbers <use> ids across placements and their mirror copies", () => {
    const { g } = render([place({ mirror: true }), place()]);
    const ids = [...g.querySelectorAll("use")].map((u) => u.getAttribute("id"));
    expect(ids).toEqual(["feature-0", "feature-1", "feature-2"]);
  });

  it("translates and rotates around the box center", () => {
    const { g } = render([place({ rotation: 30 })]);
    const child = g.firstChild as SVGElement;
    expect(child.getAttribute("transform")).toBe(
      "translate(10 8) rotate(30 2.5 1.5)",
    );
  });

  it("emits a second copy point-reflected through the canvas centre", () => {
    const { g } = render([place({ mirror: true, rotation: 30 })]);
    expect(g.childNodes.length).toBe(2);
    const mirror = g.childNodes[1] as SVGElement;
    // x' = 60-10-5 = 45, y' = 44-8-3 = 33, rotation' = 30+180 = 210.
    expect(mirror.getAttribute("transform")).toBe(
      "translate(45 33) rotate(210 2.5 1.5)",
    );
  });

  it("omits the mirror copy when mirror is false", () => {
    expect(render([place({ mirror: false })]).g.childNodes.length).toBe(1);
  });

  it("mirrors by default when mirror is unset", () => {
    expect(render([place({ mirror: undefined })]).g.childNodes.length).toBe(2);
  });

  it("references the shape def and sets palette colours as custom properties", () => {
    const { g } = render([place({ color: "rust" })]);
    const use = g.firstChild as SVGElement;
    expect(use.tagName.toLowerCase()).toBe("use");
    expect(use.getAttribute("href")).toBe("#feature-generator-5x3");
    expect(use.getAttribute("style")).toBe(
      `--body:${baseTheme.feature.palette.rust.fill};` +
        `--accent:${baseTheme.feature.palette.rust.accent}`,
    );
  });

  it("sets the shared stroke-width once on the group", () => {
    const { g } = render([place()]);
    expect(g.getAttribute("stroke-width")).toBe(
      `${baseTheme.feature.stroke_width}`,
    );
  });

  it("emits one def per distinct (type, width, height)", () => {
    const { defs } = render([
      place({ width: 3, height: 4 }),
      place({ width: 3, height: 4, x: 9, color: "rust" }), // same shape, different colour/pos
      place({ type: "gantry", width: 2, height: 2 }),
    ]);
    expect(defs.childNodes.length).toBe(2);
    expect(defs.querySelector("#feature-generator-3x4")).not.toBeNull();
    expect(defs.querySelector("#feature-gantry-2x2")).not.toBeNull();
  });

  it("sanitizes decimal dimensions in the def id", () => {
    const { defs } = render([place({ type: "l-ruin", width: 4.5, height: 5 })]);
    expect(defs.querySelector("#feature-l-ruin-4_5x5")).not.toBeNull();
  });

  it("emits colour-free geometry styled with custom-property vars", () => {
    const { defs } = render([place()]);
    const def = defs.querySelector("#feature-generator-5x3")!;
    const body = def.firstChild as SVGElement;
    expect(body.getAttribute("style")).toBe(
      "fill:var(--body);stroke:var(--accent)",
    );
    expect(body.getAttribute("fill")).toBeNull(); // no baked colour
    const accent = def.lastChild as SVGElement;
    expect(accent.getAttribute("style")).toBe("fill:var(--accent)");
  });
});
