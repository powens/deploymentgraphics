// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderIcons, ICON_SIZE } from "./icons.js";
import { baseTheme } from "./presets/theme.js";
import type { IconPlacement } from "./terrain-config.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const defsEl = (): SVGElement =>
  document.createElementNS(SVG_NS, "defs") as SVGElement;

/** Render into a throwaway defs and hand back both halves to assert on. */
function render(placements: IconPlacement[]) {
  const defs = defsEl();
  const group = renderIcons(placements, defs, baseTheme);
  return { defs, group };
}

describe("renderIcons — defs phase", () => {
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
    // only the fill is tinted; the border stroke stays neutral
    expect(circle.getAttribute("stroke")).toBe(baseTheme.icon.circle.stroke);
    const rects = [...group!.querySelectorAll("rect")];
    // cutouts take the disk (deployment) fill; body keeps the glyph fill
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
});

describe("renderIcons — use phase", () => {
  it("emits a <use> recentered on pos, referencing the def id", () => {
    const { defs, group } = render([{ type: "skull", pos: { x: 10, y: 20 } }]);
    // the ref resolves: the def it points at exists in the same defs.
    const use = group.querySelector("use")!;
    expect(use.getAttribute("href")).toBe("#icon-skull");
    expect(defs.querySelector("#icon-skull")).not.toBeNull();
    expect(use.getAttribute("transform")).toBe(
      `translate(${10 - ICON_SIZE / 2} ${20 - ICON_SIZE / 2})`,
    );
  });

  it("references the tinted def id for a player-tagged placement", () => {
    const { group } = render([
      { type: "fortress", pos: { x: 0, y: 0 }, player: "defender" },
    ]);
    expect(group.querySelector("use")!.getAttribute("href")).toBe(
      "#icon-fortress-defender",
    );
  });
});

describe("renderIcons — errors", () => {
  it("throws on an unknown icon type", () => {
    expect(() =>
      renderIcons([{ type: "dragon", pos: { x: 0, y: 0 } }], defsEl(), baseTheme),
    ).toThrow(/unknown icon type: dragon/);
  });
});
