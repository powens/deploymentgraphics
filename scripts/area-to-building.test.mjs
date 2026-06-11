import { describe, it, expect } from "vitest";
import { areaBuildingPlacement } from "./area-to-building.mjs";
import { resolvePiece } from "./terrain-resolver.mjs";
import { resolveBuilding } from "../src/building-coordinates.ts";

// gw.yml templates referenced by the converter (subset, incl. shoe-mirror).
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

// Local ring of a gw template (rectangle bbox corners, or polygon points).
const gwRing = (t) =>
  t.points
    ? t.points
    : [
        { x: 0, y: 0 },
        { x: t.width, y: 0 },
        { x: t.width, y: t.height },
        { x: 0, y: t.height },
      ];

// Apply a resolveBuilding result (translate + rotation deg) to the template ring.
const placedRing = (templateName, placed) => {
  const rad = (placed.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return gwRing(GW_TEMPLATES[templateName]).map((p) => ({
    x: placed.translate.x + p.x * cos - p.y * sin,
    y: placed.translate.y + p.x * sin + p.y * cos,
  }));
};

// Compare two polygons as point SETS (order-independent), within tolerance.
const sameSet = (a, b) => {
  expect(a.length).toBe(b.length);
  const key = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const sort = (ring) => [...ring].map(key).sort();
  const sa = sort(a);
  const sb = sort(b);
  for (let i = 0; i < sa.length; i++) {
    const [ax, ay] = sa[i].split(",").map(Number);
    const [bx, by] = sb[i].split(",").map(Number);
    expect(ax).toBeCloseTo(bx, 1);
    expect(ay).toBeCloseTo(by, 1);
  }
};

const roundTrip = (piece) => {
  const placement = areaBuildingPlacement(
    piece,
    FOOTPRINTS[piece.template],
    GW_TEMPLATES,
  );
  expect(placement.mirror).toBe(false);
  const placed = resolveBuilding(placement, GW_TEMPLATES, CANVAS);
  expect(placed).toHaveLength(1); // mirror:false -> single placement
  const expected = resolvePiece(piece, (id) => FOOTPRINTS[id]);
  sameSet(placedRing(placement.type, placed[0]), expected);
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
      mirror: "vertical",
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
});
