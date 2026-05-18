// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { makeBuildings, injectTemplateDefs } from "./buildings";

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
      [{ type: "4x6", corners: { TL: [10, 5], TR: [14, 5] } }],
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
      [{ type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [14, 5] } }],
      templates,
      canvas,
    );
    expect(group.querySelectorAll("use")).toHaveLength(1);
  });

  it("numbers <use> ids sequentially across placements", () => {
    const group = makeBuildings(
      [
        { type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [14, 5] } },
        { type: "4x6", mirror: false, corners: { TL: [20, 5], TR: [24, 5] } },
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
      [{ type: "4x6", corners: { TL: [0, 0], TR: [4, 0] }, mirror: false }],
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
            [0, 0],
            [7, 0],
            [7, 11],
            [0, 11],
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
            [0, 0],
            [7, 0],
            [0, 11],
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
      [{ type: "ruins", mirror: false, corners: { TL: [10, 5], TR: [17, 5] } }],
      {
        ruins: {
          points: [
            [0, 0],
            [7, 0],
            [7, 11],
            [0, 11],
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
