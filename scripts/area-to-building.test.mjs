import { describe, it, expect } from "vitest";
import { areaBuildingPlacement } from "./area-to-building.mjs";
import { withLookups } from "./terrain-corpus.mjs";
import { ringMismatch } from "../src/geometry.ts";
import { buildingRings } from "../src/placement.ts";

// Subset of templates-simple.yml.
const GW_TEMPLATES = {
  "large-area": { width: 7, height: 11.5 },
  "small-area": { width: 4, height: 6 },
  "large-pipes": { width: 10, height: 2.5 },
  "small-pipes": { width: 6, height: 2 },
  shoe: {
    points: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 8, y: 11.5 },
      { x: 0, y: 11.5 },
    ],
  },
  "shoe-mirror": {
    points: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 2, y: 11.5 },
      { x: 0, y: 11.5 },
    ],
  },
};

const FOOTPRINTS = {
  "area-large": { type: "rectangle", width: 11.5, height: 7 },
  "area-medium": { type: "rectangle", width: 6, height: 4 },
  "area-long-line": { type: "rectangle", width: 10, height: 2.5 },
  "area-short-line": { type: "rectangle", width: 6, height: 2 },
  "area-trapezoid": {
    type: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 2, y: 11.5 },
      { x: 0, y: 11.5 },
    ],
  },
};

const CANVAS = { width: 60, height: 44 };

const layoutOf = (piece) =>
  withLookups({ id: "t", pieces: [piece] }, (id) => FOOTPRINTS[id]);

const roundTrip = (piece) => {
  const layout = layoutOf(piece);
  const placement = areaBuildingPlacement(piece, layout, GW_TEMPLATES);
  expect(placement.mirror).toBe(false);
  const rings = buildingRings(placement, GW_TEMPLATES, CANVAS);
  expect(rings).toHaveLength(1);
  // Same vertices in any order, within tolerance.
  const target = layout.resolve(piece).ring;
  expect(rings[0]).toHaveLength(target.length);
  expect(ringMismatch(rings[0], target)).toBeLessThan(0.05);
  return placement;
};

describe("areaBuildingPlacement", () => {
  it("places an exact-match line piece", () => {
    roundTrip({
      template: "area-long-line",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    });
  });

  it("places a rotated transpose piece", () => {
    roundTrip({
      template: "area-large",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 55,
    });
  });

  it("places an un-mirrored trapezoid via shoe-mirror", () => {
    const p = roundTrip({
      template: "area-trapezoid",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 30,
    });
    expect(p.type).toBe("shoe-mirror");
  });

  it("places a mirrored trapezoid via shoe", () => {
    const p = roundTrip({
      template: "area-trapezoid",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 90,
      mirror: "horizontal",
    });
    expect(p.type).toBe("shoe");
  });

  it("places a horizontally mirrored rectangle", () => {
    roundTrip({
      template: "area-medium",
      piece_type: "area",
      position: { x: 25, y: 15 },
      rotation_degrees: 137,
      mirror: "horizontal",
    });
  });

  it("throws for an area template with no gw mapping", () => {
    const piece = {
      template: "area-unheard-of",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    };
    expect(() =>
      areaBuildingPlacement(piece, layoutOf(piece), GW_TEMPLATES),
    ).toThrow(/no gw template mapping for area template area-unheard-of/);
  });

  it("throws for a mapped area template with no 40kdc footprint", () => {
    const piece = {
      id: "a1",
      template: "area-long-line",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    };
    const layout = withLookups({ id: "t", pieces: [piece] }, () => undefined);
    expect(() => areaBuildingPlacement(piece, layout, GW_TEMPLATES)).toThrow(
      /piece a1 has no footprint or known template/,
    );
  });
});
