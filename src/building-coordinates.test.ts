import { describe, it, expect } from "vitest";
import { templateBounds, type PolygonTemplate } from "./building-coordinates";

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
