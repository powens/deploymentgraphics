// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  makeBuildings,
  injectTemplateDefs,
  segmentsToPathData,
} from "./buildings";
import type {
  Point,
  PathSegment,
  PathTemplate,
} from "./building-coordinates";

const canvas = { width: 60, height: 44 };
const templates = {
  "4x6": { width: 4, height: 6 },
};

describe("injectTemplateDefs", () => {
  it("appends a <rect> per template, sized and id'd", () => {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    injectTemplateDefs(templates, defs);
    const rect = defs.querySelector("#template-4x6");
    expect(rect).not.toBeNull();
    expect(rect!.tagName).toBe("rect");
    expect(rect!.getAttribute("width")).toBe("4");
    expect(rect!.getAttribute("height")).toBe("6");
  });
});

describe("makeBuildings", () => {
  it("emits a <use> per resolved building (primary + mirror)", () => {
    const group = makeBuildings(
      [{ type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } }],
      templates,
      canvas,
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
    const group = makeBuildings(
      [{ type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } }],
      templates,
      canvas,
    );
    expect(group.querySelectorAll("use")).toHaveLength(1);
  });

  it("numbers <use> ids sequentially across placements", () => {
    const group = makeBuildings(
      [
        { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
        { type: "4x6", mirror: false, corners: { TL: { x: 20, y: 5 }, TR: { x: 24, y: 5 } } },
      ],
      templates,
      canvas,
    );
    const uses = group.querySelectorAll("use");
    expect(uses).toHaveLength(2);
    expect(uses[0].getAttribute("id")).toBe("building-0");
    expect(uses[1].getAttribute("id")).toBe("building-1");
  });
});

describe("svg property styling", () => {
  it("injectTemplateDefs applies svg properties to template rects", () => {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectTemplateDefs({ "4x6": { width: 4, height: 6 } }, defs, {
      fill: "#808080",
      stroke_width: 1.2,
    });
    const rect = defs.querySelector("#template-4x6")!;
    expect(rect.getAttribute("fill")).toBe("#808080");
    expect(rect.getAttribute("stroke-width")).toBe("1.2");
  });

  it("makeBuildings applies svg properties to building uses", () => {
    const group = makeBuildings(
      [{ type: "4x6", corners: { TL: { x: 0, y: 0 }, TR: { x: 4, y: 0 } }, mirror: false }],
      { "4x6": { width: 4, height: 6 } },
      { width: 60, height: 44 },
      { opacity: 1 },
    );
    expect(group.querySelector("use")!.getAttribute("opacity")).toBe("1");
  });

  it("injectTemplateDefs does not set fill when svgProperties is omitted", () => {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectTemplateDefs({ "4x6": { width: 4, height: 6 } }, defs);
    expect(defs.querySelector("#template-4x6")!.getAttribute("fill")).toBeNull();
  });
});

describe("polygon templates", () => {
  it("injectTemplateDefs emits a <polygon> for a polygon template", () => {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectTemplateDefs(
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
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    injectTemplateDefs(
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
      { fill: "#808080" },
    );
    expect(defs.querySelector("#template-ruins")!.getAttribute("fill")).toBe(
      "#808080",
    );
  });

  it("makeBuildings emits a <use> referencing a polygon template", () => {
    const group = makeBuildings(
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
    );
    expect(group.querySelector("use")!.getAttribute("href")).toBe(
      "#template-ruins",
    );
  });
});

describe("path templates", () => {
  const start: Point = { x: 0, y: 0 };
  const segments: PathSegment[] = [
    { line: { x: 4, y: 0 } },
    { quad: { x: 4, y: 4 }, control: { x: 6, y: 2 } },
    { cubic: { x: 0, y: 4 }, controls: [{ x: 3, y: 6 }, { x: 1, y: 5 }] },
  ];

  it("segmentsToPathData builds an M/L/Q/C/Z path string", () => {
    expect(segmentsToPathData(start, segments)).toBe(
      "M 0 0 L 4 0 Q 6 2 4 4 C 3 6 1 5 0 4 Z",
    );
  });

  it("segmentsToPathData throws on an unrecognized segment", () => {
    expect(() =>
      segmentsToPathData(start, [{ bogus: { x: 1, y: 1 } }] as unknown as PathSegment[]),
    ).toThrow(/unrecognized/i);
  });

  it("throws on a legacy array start (not {x, y})", () => {
    expect(() =>
      segmentsToPathData([4, 0] as unknown as Point, [
        { line: { x: 4, y: 8 } },
      ]),
    ).toThrow(/expected \{ x, y \}/i);
  });

  it("injectTemplateDefs emits a <path> for a path template", () => {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    const templates: Record<string, PathTemplate> = {
      bastion: { width: 4, height: 4, start, segments },
    };
    injectTemplateDefs(templates, defs);
    const path = defs.querySelector("#template-bastion");
    expect(path).not.toBeNull();
    expect(path!.tagName).toBe("path");
    expect(path!.getAttribute("d")).toBe(
      "M 0 0 L 4 0 Q 6 2 4 4 C 3 6 1 5 0 4 Z",
    );
  });

  it("injectTemplateDefs applies svg properties to a path template", () => {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "defs",
    );
    const templates: Record<string, PathTemplate> = {
      bastion: { width: 4, height: 4, start, segments },
    };
    injectTemplateDefs(templates, defs, { fill: "#808080" });
    expect(defs.querySelector("#template-bastion")!.getAttribute("fill")).toBe(
      "#808080",
    );
  });

  it("makeBuildings emits a <use> referencing a path template", () => {
    const templates: Record<string, PathTemplate> = {
      bastion: {
        width: 8,
        height: 8,
        start: { x: 0, y: 0 },
        segments: [{ line: { x: 8, y: 0 } }, { line: { x: 8, y: 8 } }, { line: { x: 0, y: 8 } }],
      },
    };
    const group = makeBuildings(
      [{ type: "bastion", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 18, y: 5 } } }],
      templates,
      canvas,
    );
    expect(group.querySelector("use")!.getAttribute("href")).toBe(
      "#template-bastion",
    );
  });
});
