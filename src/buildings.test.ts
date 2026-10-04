// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { buildingLayer } from "./buildings";
import type { BuildingPlacement, Template } from "./building-coordinates.js";
import { browserSvgDocument, type SvgNode } from "./svg-backend.js";
import { baseTheme } from "./presets/theme.js";
import type { Theme } from "./theme.js";

/** `baseTheme` with its building styling replaced. */
const themed = (building: Theme["building"]): Theme => ({
  ...baseTheme,
  building,
});
/** Styles no building at all, for the assertions that only read geometry. */
const unstyled = themed({ group: {}, template: { default: {} } });

const doc = browserSvgDocument();
// The browser backend's `SvgNode`s are real DOM nodes.
const asElement = (node: SvgNode) => node as unknown as SVGElement;

const canvas = { width: 60, height: 44 };
const templates = {
  "4x6": { width: 4, height: 6 },
};

/** Renders the layer's defs and its node together, as the card does. */
function render(
  placements: BuildingPlacement[],
  set: Record<string, Template> = templates,
  theme: Theme = unstyled,
) {
  const layer = buildingLayer(placements, set, canvas, theme);
  const defs = doc.createElement("defs");
  layer.injectDefs?.(doc, defs);
  return { layer, defs: asElement(defs), group: asElement(layer.draw(doc)) };
}

describe("buildingLayer", () => {
  it("always draws, as an empty group when there are no placements", () => {
    const { layer, group } = render([]);
    expect(layer.draws).toBe(true);
    expect(group.getAttribute("id")).toBe("buildings");
    expect(group.childNodes.length).toBe(0);
  });

  it("references a def for every <use>, mirror copies included", () => {
    const { defs, group } = render(
      [
        { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
        { type: "ruins", mirror: false, corners: { TL: { x: 20, y: 5 }, TR: { x: 27, y: 5 } } },
      ],
      { ...templates, ruins: { points: [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 0, y: 11 }] } },
    );
    const uses = [...group.querySelectorAll("use")];
    expect(uses).toHaveLength(3);
    for (const use of uses) {
      const href = use.getAttribute("href")!;
      expect(href.startsWith("#")).toBe(true);
      expect(defs.querySelector(`[id="${href.slice(1)}"]`)).not.toBeNull();
    }
  });

  it("emits a def for every template in the set, used or not", () => {
    const { defs } = render([], { ...templates, "3x4": { width: 3, height: 4 } });
    expect(defs.querySelector("#template-4x6")).not.toBeNull();
    expect(defs.querySelector("#template-3x4")).not.toBeNull();
  });

  it("appends a <rect> per rect template, sized and id'd", () => {
    const rect = render([]).defs.querySelector("#template-4x6");
    expect(rect).not.toBeNull();
    expect(rect!.tagName).toBe("rect");
    expect(rect!.getAttribute("width")).toBe("4");
    expect(rect!.getAttribute("height")).toBe("6");
  });

  it("emits a <use> per resolved building (primary + mirror)", () => {
    const { group } = render([
      { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
    ]);
    expect(group.tagName).toBe("g");
    const uses = group.querySelectorAll("use");
    expect(uses).toHaveLength(2); // primary + mirror
    expect(uses[0].getAttribute("href")).toBe("#template-4x6");
    expect(uses[0].getAttribute("transform")).toMatch(
      /^translate\([^)]+\) rotate\([^)]+\)$/,
    );
  });

  it("emits one <use> when mirror is false", () => {
    const { group } = render([
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
    ]);
    expect(group.querySelectorAll("use")).toHaveLength(1);
  });

  it("numbers <use> ids sequentially across placements", () => {
    const { group } = render([
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
      { type: "4x6", mirror: false, corners: { TL: { x: 20, y: 5 }, TR: { x: 24, y: 5 } } },
    ]);
    const uses = group.querySelectorAll("use");
    expect(uses).toHaveLength(2);
    expect(uses[0].getAttribute("id")).toBe("building-0");
    expect(uses[1].getAttribute("id")).toBe("building-1");
  });
});

describe("per-template styling", () => {
  const styled = themed({
    group: { stroke_width: 1.2 },
    template: {
      default: { fill: "#808080" },
      pipe: { fill: "#b9772e", stroke_width: 0.3 },
    },
  });
  const set = { pipe: { width: 5.5, height: 1 }, "4x6": { width: 4, height: 6 } };

  it("styles each template def by name", () => {
    const { defs } = render([], set, styled);
    expect(defs.querySelector("#template-pipe")!.getAttribute("fill")).toBe("#b9772e");
    expect(defs.querySelector("#template-4x6")!.getAttribute("fill")).toBe("#808080");
  });

  it("merges the group props under the template's own", () => {
    const { defs } = render([], set, styled);
    // `4x6` has no entry of its own.
    expect(defs.querySelector("#template-4x6")!.getAttribute("stroke-width")).toBe("1.2");
    expect(defs.querySelector("#template-pipe")!.getAttribute("stroke-width")).toBe("0.3");
  });

  it("styles each use by the same rule as its def", () => {
    const { group } = render(
      [{ type: "pipe", mirror: false, corners: { TL: { x: 0, y: 0 }, TR: { x: 5.5, y: 0 } } }],
      set,
      styled,
    );
    expect(group.querySelector("use")!.getAttribute("fill")).toBe("#b9772e");
    expect(group.querySelector("use")!.getAttribute("stroke-width")).toBe("0.3");
  });

  it("sets no fill when the theme styles no building", () => {
    const { defs } = render([]);
    expect(defs.querySelector("#template-4x6")!.getAttribute("fill")).toBeNull();
  });
});

describe("polygon templates", () => {
  const ruins = {
    ruins: {
      points: [
        { x: 0, y: 0 },
        { x: 7, y: 0 },
        { x: 7, y: 11 },
        { x: 0, y: 11 },
      ],
    },
  };

  it("emits a <polygon> def for a polygon template", () => {
    const poly = render([], ruins).defs.querySelector("#template-ruins");
    expect(poly).not.toBeNull();
    expect(poly!.tagName).toBe("polygon");
    expect(poly!.getAttribute("points")).toBe("0,0 7,0 7,11 0,11");
  });

  it("applies svg properties to a polygon", () => {
    const { defs } = render(
      [],
      ruins,
      themed({ group: {}, template: { default: { fill: "#808080" } } }),
    );
    expect(defs.querySelector("#template-ruins")!.getAttribute("fill")).toBe(
      "#808080",
    );
  });

  it("emits a <use> referencing a polygon template", () => {
    const { group } = render(
      [{ type: "ruins", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 17, y: 5 } } }],
      ruins,
    );
    expect(group.querySelector("use")!.getAttribute("href")).toBe(
      "#template-ruins",
    );
  });
});
