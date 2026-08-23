import { describe, it, expect } from "vitest";
import { resolveCorner, templateBounds, toPoint } from "./building-coordinates";
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
