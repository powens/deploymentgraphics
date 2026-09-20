import { describe, it, expect } from "vitest";
import { areaBuildingPlacement } from "./area-to-building.mjs";
import { resolvePiece } from "./terrain-resolver.mjs";
import { withLookups } from "./terrain-corpus.mjs";
import { placedRing, resolvePlacement } from "../src/placement.ts";

// templates-simple.yml templates referenced by the converter (subset, incl. shoe-mirror).
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

// Draw a named template's ring through a `Placed`, crossing the same seam the
// renderer does rather than re-spelling the centre-pivot transform here.
const placedTemplateRing = (templateName, placed) =>
  placedRing(gwRing(GW_TEMPLATES[templateName]), placed);

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

// The converters take a resolved layout and read their lookups off it, the
// same way the pipeline hands them one - so a single-piece layout is the
// smallest honest fixture.
const layoutOf = (piece) =>
  withLookups({ id: "t", pieces: [piece] }, (id) => FOOTPRINTS[id]);

const roundTrip = (piece) => {
  const placement = areaBuildingPlacement(piece, layoutOf(piece), GW_TEMPLATES);
  expect(placement.mirror).toBe(false);
  const placed = resolvePlacement(placement, GW_TEMPLATES, CANVAS);
  expect(placed).toHaveLength(1); // mirror:false -> single placement
  const expected = resolvePiece(piece, (id) => FOOTPRINTS[id]);
  sameSet(placedTemplateRing(placement.type, placed[0]), expected);
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

  // Both guards exist to fail an upstream pull loudly rather than emit a
  // mis-placed building, so both are pinned - the mapping one names a template
  // this converter has no gw counterpart for, the footprint one a template
  // 40kdc itself stopped shipping a polygon for.
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
      template: "area-long-line",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    };
    // Mapped, so it clears the first guard - but the layout's lookup has no
    // polygon for it, which is the case the second guard is for.
    const layout = withLookups({ id: "t", pieces: [piece] }, () => undefined);
    expect(() => areaBuildingPlacement(piece, layout, GW_TEMPLATES)).toThrow(
      /no 40kdc footprint for area template area-long-line/,
    );
  });
});
