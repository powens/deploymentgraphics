// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectIconDefs, makeIcons, ICON_SIZE } from "./icons.js";
import { baseTheme } from "./presets/theme.js";
import { browserSvgDocument, type SvgNode } from "./svg-backend.js";

const doc = browserSvgDocument();
// The renderer builds against the minimal `SvgNode` contract; the browser
// backend hands back real DOM nodes, which is what the assertions query.
const asElement = (node: SvgNode) => node as unknown as SVGElement;

const defsEl = () => doc.createElement("defs");

describe("injectIconDefs", () => {
  it("builds a themed <g id='icon-skull'> with a circle and a glyph path", () => {
    const defs = defsEl();
    injectIconDefs(doc, [{ type: "skull", pos: { x: 0, y: 0 } }], defs, baseTheme);
    const group = defs.querySelector("#icon-skull");
    expect(group).not.toBeNull();
    const circle = group!.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle!.getAttribute("fill")).toBe(baseTheme.icon.circle.fill);
    expect(circle!.getAttribute("stroke-width")).toBe(
      `${baseTheme.icon.circle.stroke_width}`,
    );
    expect(group!.querySelector("path")).not.toBeNull();
  });

  it("dedupes repeated (type, player) combos", () => {
    const defs = defsEl();
    injectIconDefs(
      doc,
      [{ type: "skull", pos: { x: 0, y: 0 } }, { type: "skull", pos: { x: 1, y: 1 } }],
      defs,
      baseTheme,
    );
    expect(defs.querySelectorAll("#icon-skull")).toHaveLength(1);
  });

  it("fills fortress cutouts with the disk fill, body with the glyph fill", () => {
    const defs = defsEl();
    injectIconDefs(doc, [{ type: "fortress", pos: { x: 0, y: 0 } }], defs, baseTheme);
    const rects = [...defs.querySelectorAll("#icon-fortress rect")];
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.glyph.fill)).toBe(true);
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.circle.fill)).toBe(true);
  });

  it("tints a player-tagged disk and its cutouts with the deployment fill", () => {
    const defs = defsEl();
    injectIconDefs(
      doc,
      [{ type: "fortress", pos: { x: 0, y: 0 }, player: "attacker" }],
      defs,
      baseTheme,
    );
    const group = defs.querySelector("#icon-fortress-attacker");
    expect(group).not.toBeNull();
    const circle = group!.querySelector("circle")!;
    expect(circle.getAttribute("fill")).toBe(baseTheme.deployment.attacker.fill);
    // only the fill is tinted; the border stroke stays neutral
    expect(circle.getAttribute("stroke")).toBe(baseTheme.icon.circle.stroke);
    const rects = [...group!.querySelectorAll("rect")];
    // cutouts take the disk (deployment) fill; body keeps the glyph fill
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.deployment.attacker.fill)).toBe(true);
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.glyph.fill)).toBe(true);
  });

  it("emits distinct defs for the same type with different players", () => {
    const defs = defsEl();
    injectIconDefs(
      doc,
      [
        { type: "fortress", pos: { x: 0, y: 0 }, player: "attacker" },
        { type: "fortress", pos: { x: 1, y: 1 }, player: "defender" },
      ],
      defs,
      baseTheme,
    );
    expect(defs.querySelector("#icon-fortress-attacker")).not.toBeNull();
    expect(defs.querySelector("#icon-fortress-defender")).not.toBeNull();
  });

  it("throws on an unknown icon type", () => {
    expect(() =>
      injectIconDefs(doc, [{ type: "dragon", pos: { x: 0, y: 0 } }], defsEl(), baseTheme),
    ).toThrow(/unknown icon type: dragon/);
  });
});

describe("makeIcons", () => {
  it("emits a <use> recentered on pos", () => {
    const g = asElement(makeIcons(doc, [{ type: "skull", pos: { x: 10, y: 20 } }]));
    const use = g.querySelector("use")!;
    expect(use.getAttribute("href")).toBe("#icon-skull");
    expect(use.getAttribute("transform")).toBe(
      `translate(${10 - ICON_SIZE / 2} ${20 - ICON_SIZE / 2})`,
    );
  });

  it("references the tinted def id for a player-tagged placement", () => {
    const g = asElement(makeIcons(doc, [{ type: "fortress", pos: { x: 0, y: 0 }, player: "defender" }]));
    expect(g.querySelector("use")!.getAttribute("href")).toBe(
      "#icon-fortress-defender",
    );
  });

  it("throws on an unknown icon type", () => {
    expect(() => makeIcons(doc, [{ type: "dragon", pos: { x: 0, y: 0 } }])).toThrow(
      /unknown icon type: dragon/,
    );
  });
});
