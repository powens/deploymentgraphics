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
