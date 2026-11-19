// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { iconLayer, ICON_SIZE } from "./icons.js";
import type { IconPlacement } from "./terrain-config.js";
import { baseTheme } from "./presets/theme.js";
import { browserSvgDocument, type SvgNode } from "./svg-backend.js";

const doc = browserSvgDocument();
// The browser backend returns real DOM nodes, so tests can query them.
const asElement = (node: SvgNode) => node as unknown as SVGElement;

/** Renders the layer's defs and its node together, as the card does. */
function render(placements: IconPlacement[]) {
  const layer = iconLayer(placements, baseTheme);
  const defs = doc.createElement("defs");
  layer.injectDefs?.(doc, defs);
  return { defs: asElement(defs), g: asElement(layer.draw(doc)) };
}

describe("iconLayer", () => {
  it("draws only when there are placements", () => {
    expect(iconLayer([], baseTheme).draws).toBe(false);
    expect(iconLayer([{ type: "skull", pos: { x: 0, y: 0 } }], baseTheme).draws).toBe(true);
  });

  it("references a def for every <use>", () => {
    const { defs, g } = render([
      { type: "skull", pos: { x: 0, y: 0 } },
      { type: "skull", pos: { x: 9, y: 9 } },
      { type: "fortress", pos: { x: 1, y: 1 }, player: "attacker" },
      { type: "fortress", pos: { x: 2, y: 2 } },
    ]);
    const uses = [...g.querySelectorAll("use")];
    expect(uses.map((u) => u.getAttribute("id"))).toEqual([
      "icon-0",
      "icon-1",
      "icon-2",
      "icon-3",
    ]);
    for (const use of uses) {
      const href = use.getAttribute("href")!;
      expect(href.startsWith("#")).toBe(true);
      expect(defs.querySelector(`[id="${href.slice(1)}"]`)).not.toBeNull();
    }
  });

  it("builds a themed <g id='icon-skull'> with a circle and a glyph path", () => {
    const { defs } = render([{ type: "skull", pos: { x: 0, y: 0 } }]);
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
    const { defs } = render([
      { type: "skull", pos: { x: 0, y: 0 } },
      { type: "skull", pos: { x: 1, y: 1 } },
    ]);
    expect(defs.querySelectorAll("#icon-skull")).toHaveLength(1);
  });

  it("fills fortress cutouts with the disk fill, body with the glyph fill", () => {
    const { defs } = render([{ type: "fortress", pos: { x: 0, y: 0 } }]);
    const rects = [...defs.querySelectorAll("#icon-fortress rect")];
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.glyph.fill)).toBe(true);
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.circle.fill)).toBe(true);
  });

  it("tints a player-tagged disk and its cutouts with the deployment fill", () => {
    const { defs } = render([
      { type: "fortress", pos: { x: 0, y: 0 }, player: "attacker" },
    ]);
    const group = defs.querySelector("#icon-fortress-attacker");
    expect(group).not.toBeNull();
    const circle = group!.querySelector("circle")!;
    expect(circle.getAttribute("fill")).toBe(baseTheme.deployment.attacker.fill);
    expect(circle.getAttribute("stroke")).toBe(baseTheme.icon.circle.stroke);
    const rects = [...group!.querySelectorAll("rect")];
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.deployment.attacker.fill)).toBe(true);
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.glyph.fill)).toBe(true);
  });

  it("emits distinct defs for the same type with different players", () => {
    const { defs } = render([
      { type: "fortress", pos: { x: 0, y: 0 }, player: "attacker" },
      { type: "fortress", pos: { x: 1, y: 1 }, player: "defender" },
    ]);
    expect(defs.querySelector("#icon-fortress-attacker")).not.toBeNull();
    expect(defs.querySelector("#icon-fortress-defender")).not.toBeNull();
  });

  it("emits a <use> recentered on pos", () => {
    const { g } = render([{ type: "skull", pos: { x: 10, y: 20 } }]);
    const use = g.querySelector("use")!;
    expect(use.getAttribute("href")).toBe("#icon-skull");
    expect(use.getAttribute("transform")).toBe(
      `translate(${10 - ICON_SIZE / 2} ${20 - ICON_SIZE / 2})`,
    );
  });

  it("references the tinted def id for a player-tagged placement", () => {
    const { g } = render([
      { type: "fortress", pos: { x: 0, y: 0 }, player: "defender" },
    ]);
    expect(g.querySelector("use")!.getAttribute("href")).toBe(
      "#icon-fortress-defender",
    );
  });
});
