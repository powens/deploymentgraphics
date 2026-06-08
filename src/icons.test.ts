// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectIconDefs, makeIcons, ICON_SIZE } from "./icons.js";
import { baseTheme } from "./presets/theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const defsEl = (): SVGElement =>
  document.createElementNS(SVG_NS, "defs") as SVGElement;

describe("injectIconDefs", () => {
  it("builds a themed <g id='icon-skull'> with a circle and a glyph path", () => {
    const defs = defsEl();
    injectIconDefs(["skull"], defs, baseTheme);
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

  it("dedupes repeated types", () => {
    const defs = defsEl();
    injectIconDefs(["skull", "skull"], defs, baseTheme);
    expect(defs.querySelectorAll("#icon-skull")).toHaveLength(1);
  });

  it("fills fortress cutouts with the circle fill, body with the glyph fill", () => {
    const defs = defsEl();
    injectIconDefs(["fortress"], defs, baseTheme);
    const rects = [...defs.querySelectorAll("#icon-fortress rect")];
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.glyph.fill)).toBe(true);
    expect(rects.some((r) => r.getAttribute("fill") === baseTheme.icon.circle.fill)).toBe(true);
  });

  it("throws on an unknown icon type", () => {
    expect(() => injectIconDefs(["dragon"], defsEl(), baseTheme)).toThrow(
      /unknown icon type: dragon/,
    );
  });
});

describe("makeIcons", () => {
  it("emits a <use> recentered on pos", () => {
    const g = makeIcons([{ type: "skull", pos: [10, 20] }]);
    const use = g.querySelector("use")!;
    expect(use.getAttribute("href")).toBe("#icon-skull");
    expect(use.getAttribute("transform")).toBe(
      `translate(${10 - ICON_SIZE / 2} ${20 - ICON_SIZE / 2})`,
    );
  });

  it("throws on an unknown icon type", () => {
    expect(() => makeIcons([{ type: "dragon", pos: [0, 0] }])).toThrow(
      /unknown icon type: dragon/,
    );
  });
});
