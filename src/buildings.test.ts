// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { makeBuildings, injectTemplateDefs } from "./buildings";
import { browserSvgDocument, type SvgNode } from "./svg-backend.js";

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
    injectTemplateDefs(doc, templates, defs);
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
      ),
    );
    const uses = group.querySelectorAll("use");
    expect(uses).toHaveLength(2);
    expect(uses[0].getAttribute("id")).toBe("building-0");
    expect(uses[1].getAttribute("id")).toBe("building-1");
  });
});

describe("per-template styling", () => {
  // styleFor maps a template name -> its SVG props (group base merged in by
  // the caller in real usage; here we pass props directly).
  const styleFor = (name: string) =>
    name === "pipe"
      ? { fill: "#b9772e", stroke_width: 0.3 }
      : { fill: "#808080", stroke_width: 1.2 };

  it("injectTemplateDefs styles each template def by name", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(doc, { pipe: { width: 5.5, height: 1 }, "4x6": { width: 4, height: 6 } }, defs, styleFor);
    expect(defs.querySelector("#template-pipe")!.getAttribute("fill")).toBe("#b9772e");
    expect(defs.querySelector("#template-4x6")!.getAttribute("fill")).toBe("#808080");
  });

  it("makeBuildings styles each use by its template name", () => {
    const group = asElement(
      makeBuildings(
        doc,
        [{ type: "pipe", mirror: false, corners: { TL: { x: 0, y: 0 }, TR: { x: 5.5, y: 0 } } }],
        { pipe: { width: 5.5, height: 1 } },
        { width: 60, height: 44 },
        styleFor,
      ),
    );
    expect(group.querySelector("use")!.getAttribute("fill")).toBe("#b9772e");
  });

  it("injectTemplateDefs sets no fill when styleFor is omitted", () => {
    const defs = doc.createElement("defs");
    injectTemplateDefs(doc, { "4x6": { width: 4, height: 6 } }, defs);
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
      () => ({ fill: "#808080" }),
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
      ),
    );
    expect(group.querySelector("use")!.getAttribute("href")).toBe(
      "#template-ruins",
    );
  });
});

