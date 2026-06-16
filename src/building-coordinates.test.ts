import { describe, it, expect } from "vitest";
import { resolveCorner, templateBounds, toPoint } from "./building-coordinates";
import { resolveBuilding } from "./placement";
import type {
  PolygonTemplate,
  PathTemplate,
  Template,
} from "./building-coordinates";

const canvas = { width: 60, height: 44 };

describe("resolveCorner", () => {
  it("resolves from TL (x,y are inward distances)", () => {
    expect(resolveCorner({ x: 10, y: 5 }, "TL", canvas)).toEqual({ x: 10, y: 5 });
  });

  it("resolves from TR", () => {
    expect(resolveCorner({ x: 10, y: 5 }, "TR", canvas)).toEqual({ x: 50, y: 5 });
  });

  it("resolves from BL", () => {
    expect(resolveCorner({ x: 10, y: 5 }, "BL", canvas)).toEqual({ x: 10, y: 39 });
  });

  it("resolves from BR", () => {
    expect(resolveCorner({ x: 10, y: 5 }, "BR", canvas)).toEqual({ x: 50, y: 39 });
  });

  it("lets a 'from' field override the default anchor", () => {
    expect(resolveCorner({ x: 10, y: 5, from: "TL" }, "BR", canvas)).toEqual({ x: 10, y: 5 });
  });
});

const templates = {
  "4x6": { width: 4, height: 6 },
  "6x12": { width: 6, height: 12 },
  "3x4": { width: 3, height: 4 },
};

describe("resolveBuilding (single, non-mirrored)", () => {
  it("places an axis-aligned building from TL", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("4x6");
    expect(result[0].translate.x).toBeCloseTo(10);
    expect(result[0].translate.y).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a building rotated by a known angle (90 degrees)", () => {
    const result = resolveBuilding(
      { type: "6x12", mirror: false, corners: { TL: { x: 20, y: 10 }, TR: { x: 20, y: 16 } } },
      templates,
      canvas,
    );
    expect(result[0].translate.x).toBeCloseTo(20);
    expect(result[0].translate.y).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(90);
  });

  it("resolves the two corners from different canvas anchors", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 46, y: 5, from: "TR" } } },
      templates,
      canvas,
    );
    // [46,5,TR] -> (60-46, 5) = (14,5): same building as the axis-aligned case
    expect(result[0].translate.x).toBeCloseTo(10);
    expect(result[0].translate.y).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a building defined by a diagonal corner pair", () => {
    const result = resolveBuilding(
      { type: "3x4", mirror: false, corners: { TL: { x: 10, y: 10 }, BR: { x: 13, y: 14 } } },
      templates,
      canvas,
    );
    expect(result[0].translate.x).toBeCloseTo(10);
    expect(result[0].translate.y).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a diagonal corner pair with a non-zero rotation", () => {
    // 3x4 template (local diagonal TL->BR = (3,4)) rotated 90 degrees.
    // rotate((3,4), 90deg) = (-4,3), so BR sits at TL + (-4,3).
    const result = resolveBuilding(
      { type: "3x4", mirror: false, corners: { TL: { x: 20, y: 10 }, BR: { x: 16, y: 13 } } },
      templates,
      canvas,
    );
    expect(result[0].translate.x).toBeCloseTo(20);
    expect(result[0].translate.y).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(90);
  });
});

describe("resolveBuilding (single corner)", () => {
  it("pins a single TL corner with no rotation", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 } } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("4x6");
    expect(result[0].translate.x).toBeCloseTo(10);
    expect(result[0].translate.y).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("pins a single TR corner (translate offset by the template width)", () => {
    // building TR corner -> canvas point (10,5); localCorner(TR)=(4,0)
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TR: { x: 10, y: 5 } } },
      templates,
      canvas,
    );
    expect(result[0].translate.x).toBeCloseTo(6);
    expect(result[0].translate.y).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("pins a single BL corner (translate offset by the template height)", () => {
    // building BL corner -> canvas point (10,5); localCorner(BL)=(0,6)
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { BL: { x: 10, y: 5 } } },
      templates,
      canvas,
    );
    expect(result[0].translate.x).toBeCloseTo(10);
    expect(result[0].translate.y).toBeCloseTo(-1);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("pins a single BR corner (offset by width and height)", () => {
    // building BR corner -> canvas point (10,5); localCorner(BR)=(4,6)
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { BR: { x: 10, y: 5 } } },
      templates,
      canvas,
    );
    expect(result[0].translate.x).toBeCloseTo(6);
    expect(result[0].translate.y).toBeCloseTo(-1);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("honours the canvas anchor for a single corner", () => {
    // building TL corner -> (10,5) from canvas TR = (60-10, 5) = (50,5)
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5, from: "TR" } } },
      templates,
      canvas,
    );
    expect(result[0].translate.x).toBeCloseTo(50);
    expect(result[0].translate.y).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("mirrors a single corner by default (mirror at rotation 180)", () => {
    const result = resolveBuilding(
      { type: "4x6", corners: { TL: { x: 10, y: 5 } } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(2);
    const [primary, mirrored] = result;
    expect(primary.translate.x).toBeCloseTo(10);
    expect(primary.translate.y).toBeCloseTo(5);
    expect(primary.rotation).toBeCloseTo(0);
    expect(mirrored.translate.x).toBeCloseTo(50);
    expect(mirrored.translate.y).toBeCloseTo(39);
    expect(mirrored.rotation).toBeCloseTo(180);
  });
});

describe("resolveBuilding mirroring", () => {
  it("emits a 180-degree point-reflected copy by default", () => {
    const result = resolveBuilding(
      { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(2);
    const [primary, mirrored] = result;
    expect(primary.translate.x).toBeCloseTo(10);
    expect(primary.translate.y).toBeCloseTo(5);
    expect(primary.rotation).toBeCloseTo(0);
    // 180-degree point reflection through the canvas centre (30, 22)
    expect(mirrored.translate.x).toBeCloseTo(50);
    expect(mirrored.translate.y).toBeCloseTo(39);
    expect(mirrored.rotation).toBeCloseTo(180);
  });

  it("emits only the primary when mirror is false", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(1);
  });

  it("mirrors when mirror is explicitly true", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: true, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(2);
  });
});

describe("resolveBuilding validation", () => {
  it("throws on an unknown template", () => {
    expect(() =>
      resolveBuilding(
        { type: "9x9", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
        templates,
        canvas,
      ),
    ).toThrow(/unknown template/i);
  });

  it("throws when there are no corners", () => {
    expect(() =>
      resolveBuilding({ type: "4x6", corners: {} }, templates, canvas),
    ).toThrow(/1 or 2 corners/i);
  });

  it("throws when there are more than 2 corners", () => {
    expect(() =>
      resolveBuilding(
        { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 }, BR: { x: 14, y: 11 } } },
        templates,
        canvas,
      ),
    ).toThrow(/1 or 2 corners/i);
  });

  it("throws when the corner distance disagrees with the template edge", () => {
    // TL->TR span is 5 but the 4x6 template's TL->TR edge is 4
    expect(() =>
      resolveBuilding(
        { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 15, y: 5 } } },
        templates,
        canvas,
      ),
    ).toThrow(/template edge/i);
  });

  it("accepts a corner distance within the 0.1\" tolerance", () => {
    expect(() =>
      resolveBuilding(
        { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14.05, y: 5 } } },
        templates,
        canvas,
      ),
    ).not.toThrow();
  });
});

describe("templateBounds", () => {
  it("returns the stored size for a rectangle template", () => {
    expect(templateBounds({ width: 4, height: 6 }, "rect")).toEqual({
      width: 4,
      height: 6,
    });
  });

  it("derives the bounding box from polygon points", () => {
    const poly: PolygonTemplate = {
      points: [
        { x: 0, y: 0 },
        { x: 7, y: 0 },
        { x: 7, y: 11 },
        { x: 0, y: 11 },
      ],
    };
    expect(templateBounds(poly, "poly")).toEqual({ width: 7, height: 11 });
  });

  it("derives the bounding box from an irregular polygon", () => {
    const poly: PolygonTemplate = {
      points: [
        { x: 1, y: 0 },
        { x: 7, y: 2 },
        { x: 5, y: 11 },
        { x: 0, y: 6 },
      ],
    };
    expect(templateBounds(poly, "poly")).toEqual({ width: 7, height: 11 });
  });

  it("throws on a polygon with fewer than 3 points", () => {
    const poly: PolygonTemplate = {
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    };
    expect(() => templateBounds(poly, "poly")).toThrow(/at least 3 points/i);
  });

  it("throws when the polygon bounding box does not start at 0,0", () => {
    const poly: PolygonTemplate = {
      points: [
        { x: 2, y: 1 },
        { x: 9, y: 1 },
        { x: 9, y: 12 },
        { x: 2, y: 12 },
      ],
    };
    expect(() => templateBounds(poly, "poly")).toThrow(/0,0/);
  });

  it("uses a declared bounding box, letting geometry protrude past it", () => {
    // The body fills 0..10 x 0..2.5; a nubbin pokes above (y=-0.5) and below
    // (y=3) the box. The declared box, not the geometry extent, is the bounds.
    const poly: PolygonTemplate = {
      width: 10,
      height: 2.5,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: -0.5 },
        { x: 10, y: 0 },
        { x: 10, y: 2.5 },
        { x: 6, y: 3 },
        { x: 0, y: 2.5 },
      ],
    };
    expect(templateBounds(poly, "poly")).toEqual({ width: 10, height: 2.5 });
  });

  it("throws when a declared polygon bounding box is non-positive", () => {
    const poly = {
      width: 0,
      height: 5,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 5 },
      ],
    } as PolygonTemplate;
    expect(() => templateBounds(poly, "poly")).toThrow(
      /positive width and height/i,
    );
  });
});

describe("resolveBuilding with a polygon template", () => {
  const polyTemplates: Record<string, PolygonTemplate> = {
    ruins: {
      points: [
        { x: 1, y: 0 },
        { x: 7, y: 2 },
        { x: 5, y: 11 },
        { x: 0, y: 6 },
      ],
    },
  };

  it("places a polygon by pinning its bounding-box corners", () => {
    // The polygon's bbox is 7x11, so TL->TR must span 7.
    const result = resolveBuilding(
      { type: "ruins", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 17, y: 5 } } },
      polyTemplates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("ruins");
    expect(result[0].translate.x).toBeCloseTo(10);
    expect(result[0].translate.y).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("throws when a corner span disagrees with the polygon bbox edge", () => {
    // TL->TR span is 6 but the polygon bbox's TL->TR edge is 7.
    expect(() =>
      resolveBuilding(
        { type: "ruins", corners: { TL: { x: 10, y: 5 }, TR: { x: 16, y: 5 } } },
        polyTemplates,
        canvas,
      ),
    ).toThrow(/template edge/i);
  });
});

describe("templateBounds with a path template", () => {
  const pathTemplate: PathTemplate = {
    width: 8,
    height: 8,
    start: { x: 4, y: 0 },
    segments: [
      { cubic: { x: 8, y: 4 }, controls: [{ x: 6, y: 0 }, { x: 8, y: 2 }] },
      { line: { x: 4, y: 8 } },
      { quad: { x: 0, y: 4 }, control: { x: 0, y: 8 } },
      { line: { x: 4, y: 0 } },
    ],
  };

  it("returns the declared size for a path template", () => {
    expect(templateBounds(pathTemplate, "path")).toEqual({
      width: 8,
      height: 8,
    });
  });

  it("throws on a non-positive width or height", () => {
    expect(() => templateBounds({ ...pathTemplate, width: 0 }, "path")).toThrow(
      /positive width and height/i,
    );
  });

  it("throws when start is missing", () => {
    const noStart = {
      width: 8,
      height: 8,
      segments: pathTemplate.segments,
    } as unknown as Template;
    expect(() => templateBounds(noStart, "path")).toThrow(/path start/i);
  });

  it("throws when start is not a 2-number point", () => {
    const badStart = { ...pathTemplate, start: {} } as unknown as Template;
    expect(() => templateBounds(badStart, "path")).toThrow(/path start/i);
  });

  it("throws on fewer than 2 segments", () => {
    expect(() =>
      templateBounds(
        { ...pathTemplate, segments: [{ line: { x: 4, y: 0 } }] },
        "path",
      ),
    ).toThrow(/at least 2 segments/i);
  });
});

describe("resolveBuilding with a path template", () => {
  const pathTemplates: Record<string, PathTemplate> = {
    bastion: {
      width: 8,
      height: 8,
      start: { x: 4, y: 0 },
      segments: [
        { cubic: { x: 8, y: 4 }, controls: [{ x: 6, y: 0 }, { x: 8, y: 2 }] },
        { cubic: { x: 4, y: 8 }, controls: [{ x: 8, y: 6 }, { x: 6, y: 8 }] },
        { cubic: { x: 0, y: 4 }, controls: [{ x: 2, y: 8 }, { x: 0, y: 6 }] },
        { cubic: { x: 4, y: 0 }, controls: [{ x: 0, y: 2 }, { x: 2, y: 0 }] },
      ],
    },
  };

  it("places a path template by pinning its declared bounding-box corners", () => {
    // The declared bbox is 8x8, so TL->TR must span 8.
    const result = resolveBuilding(
      { type: "bastion", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 18, y: 5 } } },
      pathTemplates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("bastion");
    expect(result[0].translate.x).toBeCloseTo(10);
    expect(result[0].translate.y).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });
});

describe("toPoint", () => {
  it("returns a valid {x, y} unchanged", () => {
    expect(toPoint({ x: 1, y: 5 }, "ctx")).toEqual({ x: 1, y: 5 });
  });

  it("throws on a legacy [x, y] array", () => {
    expect(() => toPoint([60, 0], "deployment_zone[0]")).toThrow(
      /expected \{ x, y \}/i,
    );
  });

  it("throws when x or y is missing", () => {
    expect(() => toPoint({ x: 1 }, "ctx")).toThrow(/expected \{ x, y \}/i);
  });

  it("throws on null", () => {
    expect(() => toPoint(null, "ctx")).toThrow(/expected \{ x, y \}/i);
  });
});
