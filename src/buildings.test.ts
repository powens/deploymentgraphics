// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { makeBuildings, injectTemplateDefs } from "./buildings";
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
// The renderer builds against the minimal `SvgNode` contract; the browser
// backend hands back real DOM nodes, which is what the assertions query.
const asElement = (node: SvgNode) => node as unknown as SVGElement;

const canvas = { width: 60, height: 44 };
const templates = {
  "4x6": { width: 4, height: 6 },
};

describe("injectTemplateDefs", () => {
  it("appends a <rect> per template, sized and id'd", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(doc, templates, defs, unstyled);
    const rect = defs.querySelector("#template-4x6");
    expect(rect).not.toBeNull();
    expect(rect!.tagName).toBe("rect");
    expect(rect!.getAttribute("width")).toBe("4");
    expect(rect!.getAttribute("height")).toBe("6");
  });
});

describe("makeBuildings", () => {
  it("emits a <use> per resolved building (primary + mirror)", () => {
    const group = asElement(
      makeBuildings(
        doc,
        [{ type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } }],
        templates,
        canvas,
        unstyled,
      ),
    );
    expect(group.tagName).toBe("g");
    const uses = group.querySelectorAll("use");
    expect(uses).toHaveLength(2); // primary + mirror
    expect(uses[0].getAttribute("href")).toBe("#template-4x6");
    expect(uses[0].getAttribute("transform")).toMatch(
      /^translate\([^)]+\) rotate\([^)]+\)$/,
    );
  });

  it("emits one <use> when mirror is false", () => {
    const group = asElement(
      makeBuildings(
        doc,
        [{ type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } }],
        templates,
        canvas,
        unstyled,
      ),
    );
    expect(group.querySelectorAll("use")).toHaveLength(1);
  });

  it("numbers <use> ids sequentially across placements", () => {
    const group = asElement(
      makeBuildings(
        doc,
        [
          { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
          { type: "4x6", mirror: false, corners: { TL: { x: 20, y: 5 }, TR: { x: 24, y: 5 } } },
        ],
        templates,
        canvas,
        unstyled,
      ),
    );
    const uses = group.querySelectorAll("use");
    expect(uses).toHaveLength(2);
    expect(uses[0].getAttribute("id")).toBe("building-0");
    expect(uses[1].getAttribute("id")).toBe("building-1");
  });
});

describe("per-template styling", () => {
  // The rule both halves read: the shared group props as a base, then the
  // template's own entry, falling back to `default`.
  const styled = themed({
    group: { stroke_width: 1.2 },
    template: {
      default: { fill: "#808080" },
      pipe: { fill: "#b9772e", stroke_width: 0.3 },
    },
  });

  it("injectTemplateDefs styles each template def by name", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(doc, { pipe: { width: 5.5, height: 1 }, "4x6": { width: 4, height: 6 } }, defs, styled);
    expect(defs.querySelector("#template-pipe")!.getAttribute("fill")).toBe("#b9772e");
    expect(defs.querySelector("#template-4x6")!.getAttribute("fill")).toBe("#808080");
  });

  it("merges the group props under the template's own", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(doc, { pipe: { width: 5.5, height: 1 }, "4x6": { width: 4, height: 6 } }, defs, styled);
    // `4x6` has no entry of its own, so it takes the group's stroke width...
    expect(defs.querySelector("#template-4x6")!.getAttribute("stroke-width")).toBe("1.2");
    // ...and `pipe` overrides it.
    expect(defs.querySelector("#template-pipe")!.getAttribute("stroke-width")).toBe("0.3");
  });

  it("makeBuildings styles each use by the same rule as its def", () => {
    const group = asElement(
      makeBuildings(
        doc,
        [{ type: "pipe", mirror: false, corners: { TL: { x: 0, y: 0 }, TR: { x: 5.5, y: 0 } } }],
        { pipe: { width: 5.5, height: 1 } },
        { width: 60, height: 44 },
        styled,
      ),
    );
    expect(group.querySelector("use")!.getAttribute("fill")).toBe("#b9772e");
    expect(group.querySelector("use")!.getAttribute("stroke-width")).toBe("0.3");
  });

  it("sets no fill when the theme styles no building", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(doc, { "4x6": { width: 4, height: 6 } }, defs, unstyled);
    expect(defs.querySelector("#template-4x6")!.getAttribute("fill")).toBeNull();
  });
});

describe("polygon templates", () => {
  it("injectTemplateDefs emits a <polygon> for a polygon template", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(
      doc,
      {
        ruins: {
          points: [
            { x: 0, y: 0 },
            { x: 7, y: 0 },
            { x: 7, y: 11 },
            { x: 0, y: 11 },
          ],
        },
      },
      defs,
      unstyled,
    );
    const poly = defs.querySelector("#template-ruins");
    expect(poly).not.toBeNull();
    expect(poly!.tagName).toBe("polygon");
    expect(poly!.getAttribute("points")).toBe("0,0 7,0 7,11 0,11");
  });

  it("injectTemplateDefs applies svg properties to a polygon", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(
      doc,
      {
        ruins: {
          points: [
            { x: 0, y: 0 },
            { x: 7, y: 0 },
            { x: 0, y: 11 },
          ],
        },
      },
      defs,
      themed({ group: {}, template: { default: { fill: "#808080" } } }),
    );
    expect(defs.querySelector("#template-ruins")!.getAttribute("fill")).toBe(
      "#808080",
    );
  });

  it("makeBuildings emits a <use> referencing a polygon template", () => {
    const group = asElement(
      makeBuildings(
        doc,
        [{ type: "ruins", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 17, y: 5 } } }],
        {
          ruins: {
            points: [
              { x: 0, y: 0 },
              { x: 7, y: 0 },
              { x: 7, y: 11 },
              { x: 0, y: 11 },
            ],
          },
        },
        canvas,
        unstyled,
      ),
    );
    expect(group.querySelector("use")!.getAttribute("href")).toBe(
      "#template-ruins",
    );
  });
});

