import { describe, it, expect } from "vitest";
import {
  resolveCorner,
  resolveBuilding,
  templateBounds,
} from "./building-coordinates";
import type {
  PolygonTemplate,
  PathTemplate,
  Template,
} from "./building-coordinates";

const canvas = { width: 60, height: 44 };

describe("resolveCorner", () => {
  it("resolves from TL (x,y are inward distances)", () => {
    expect(resolveCorner([10, 5], "TL", canvas)).toEqual([10, 5]);
  });

  it("resolves from TR", () => {
    expect(resolveCorner([10, 5], "TR", canvas)).toEqual([50, 5]);
  });

  it("resolves from BL", () => {
    expect(resolveCorner([10, 5], "BL", canvas)).toEqual([10, 39]);
  });

  it("resolves from BR", () => {
    expect(resolveCorner([10, 5], "BR", canvas)).toEqual([50, 39]);
  });

  it("lets a 3rd element override the default anchor", () => {
    expect(resolveCorner([10, 5, "TL"], "BR", canvas)).toEqual([10, 5]);
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
      { type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [14, 5] } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("4x6");
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a building rotated by a known angle (90 degrees)", () => {
    const result = resolveBuilding(
      { type: "6x12", mirror: false, corners: { TL: [20, 10], TR: [20, 16] } },
      templates,
      canvas,
    );
    expect(result[0].translate[0]).toBeCloseTo(20);
    expect(result[0].translate[1]).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(90);
  });

  it("resolves the two corners from different canvas anchors", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [46, 5, "TR"] } },
      templates,
      canvas,
    );
    // [46,5,TR] -> (60-46, 5) = (14,5): same building as the axis-aligned case
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a building defined by a diagonal corner pair", () => {
    const result = resolveBuilding(
      { type: "3x4", mirror: false, corners: { TL: [10, 10], BR: [13, 14] } },
      templates,
      canvas,
    );
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a diagonal corner pair with a non-zero rotation", () => {
    // 3x4 template (local diagonal TL->BR = (3,4)) rotated 90 degrees.
    // rotate((3,4), 90deg) = (-4,3), so BR sits at TL + (-4,3).
    const result = resolveBuilding(
      { type: "3x4", mirror: false, corners: { TL: [20, 10], BR: [16, 13] } },
      templates,
      canvas,
    );
    expect(result[0].translate[0]).toBeCloseTo(20);
    expect(result[0].translate[1]).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(90);
  });
});

describe("resolveBuilding mirroring", () => {
  it("emits a 180-degree point-reflected copy by default", () => {
    const result = resolveBuilding(
      { type: "4x6", corners: { TL: [10, 5], TR: [14, 5] } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(2);
    const [primary, mirrored] = result;
    expect(primary.translate[0]).toBeCloseTo(10);
    expect(primary.translate[1]).toBeCloseTo(5);
    expect(primary.rotation).toBeCloseTo(0);
    // 180-degree point reflection through the canvas centre (30, 22)
    expect(mirrored.translate[0]).toBeCloseTo(50);
    expect(mirrored.translate[1]).toBeCloseTo(39);
    expect(mirrored.rotation).toBeCloseTo(180);
  });

  it("emits only the primary when mirror is false", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [14, 5] } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(1);
  });

  it("mirrors when mirror is explicitly true", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: true, corners: { TL: [10, 5], TR: [14, 5] } },
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
        { type: "9x9", corners: { TL: [10, 5], TR: [14, 5] } },
        templates,
        canvas,
      ),
    ).toThrow(/unknown template/i);
  });

  it("throws when there are not exactly 2 corners", () => {
    expect(() =>
      resolveBuilding(
        { type: "4x6", corners: { TL: [10, 5] } },
        templates,
        canvas,
      ),
    ).toThrow(/exactly 2 corners/i);
  });

  it("throws when the corner distance disagrees with the template edge", () => {
    // TL->TR span is 5 but the 4x6 template's TL->TR edge is 4
    expect(() =>
      resolveBuilding(
        { type: "4x6", corners: { TL: [10, 5], TR: [15, 5] } },
        templates,
        canvas,
      ),
    ).toThrow(/template edge/i);
  });

  it("accepts a corner distance within the 0.1\" tolerance", () => {
    expect(() =>
      resolveBuilding(
        { type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [14.05, 5] } },
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
        [0, 0],
        [7, 0],
        [7, 11],
        [0, 11],
      ],
    };
    expect(templateBounds(poly, "poly")).toEqual({ width: 7, height: 11 });
  });

  it("derives the bounding box from an irregular polygon", () => {
    const poly: PolygonTemplate = {
      points: [
        [1, 0],
        [7, 2],
        [5, 11],
        [0, 6],
      ],
    };
    expect(templateBounds(poly, "poly")).toEqual({ width: 7, height: 11 });
  });

  it("throws on a polygon with fewer than 3 points", () => {
    const poly: PolygonTemplate = {
      points: [
        [0, 0],
        [4, 0],
      ],
    };
    expect(() => templateBounds(poly, "poly")).toThrow(/at least 3 points/i);
  });

  it("throws when the polygon bounding box does not start at 0,0", () => {
    const poly: PolygonTemplate = {
      points: [
        [2, 1],
        [9, 1],
        [9, 12],
        [2, 12],
      ],
    };
    expect(() => templateBounds(poly, "poly")).toThrow(/0,0/);
  });
});

describe("resolveBuilding with a polygon template", () => {
  const polyTemplates: Record<string, PolygonTemplate> = {
    ruins: {
      points: [
        [1, 0],
        [7, 2],
        [5, 11],
        [0, 6],
      ],
    },
  };

  it("places a polygon by pinning its bounding-box corners", () => {
    // The polygon's bbox is 7x11, so TL->TR must span 7.
    const result = resolveBuilding(
      { type: "ruins", mirror: false, corners: { TL: [10, 5], TR: [17, 5] } },
      polyTemplates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("ruins");
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("throws when a corner span disagrees with the polygon bbox edge", () => {
    // TL->TR span is 6 but the polygon bbox's TL->TR edge is 7.
    expect(() =>
      resolveBuilding(
        { type: "ruins", corners: { TL: [10, 5], TR: [16, 5] } },
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
    start: [4, 0],
    segments: [
      { cubic: [8, 4], controls: [[6, 0], [8, 2]] },
      { line: [4, 8] },
      { quad: [0, 4], control: [0, 8] },
      { line: [4, 0] },
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
    expect(() => templateBounds(noStart, "path")).toThrow(/start point/i);
  });

  it("throws on fewer than 2 segments", () => {
    expect(() =>
      templateBounds(
        { ...pathTemplate, segments: [{ line: [4, 0] }] },
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
      start: [4, 0],
      segments: [
        { cubic: [8, 4], controls: [[6, 0], [8, 2]] },
        { cubic: [4, 8], controls: [[8, 6], [6, 8]] },
        { cubic: [0, 4], controls: [[2, 8], [0, 6]] },
        { cubic: [4, 0], controls: [[0, 2], [2, 0]] },
      ],
    },
  };

  it("places a path template by pinning its declared bounding-box corners", () => {
    // The declared bbox is 8x8, so TL->TR must span 8.
    const result = resolveBuilding(
      { type: "bastion", mirror: false, corners: { TL: [10, 5], TR: [18, 5] } },
      pathTemplates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("bastion");
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });
});
