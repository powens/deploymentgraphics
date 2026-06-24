import { describe, it, expect } from "vitest";
import { featureBuildingPlacement } from "./feature-to-building.mjs";
import { resolvePiece } from "./terrain-resolver.mjs";
import { resolveBuilding } from "../src/placement.ts";

const CANVAS = { width: 60, height: 44 };

// The two building templates this converter targets (plus a parent area
// footprint used by the parented-piece test).
const TEMPLATES = {
  pipe: { width: 5.5, height: 1 },
  barricade: {
    points: [
      { x: 0, y: 0 },
      { x: 3.5, y: 0 },
      { x: 3.5, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 1 },
    ],
  },
  "area-large": { width: 11.5, height: 7 },
};

// 40kdc footprints for the *named* templates (inline footprints are carried on
// the piece itself).
const FOOTPRINTS = {
  pipe: { type: "rectangle", width: 5.5, height: 1 },
  barricade: { type: "polygon", points: TEMPLATES.barricade.points },
  "area-large": { type: "rectangle", width: 11.5, height: 7 },
};
const lookupFootprint = (id) => FOOTPRINTS[id];

// Template-local closed ring (rectangle from width/height, or explicit points).
const ringOf = (t) =>
  t.points
    ? t.points.map((p) => ({ x: p.x, y: p.y }))
    : [
        { x: 0, y: 0 },
        { x: t.width, y: 0 },
        { x: t.width, y: t.height },
        { x: 0, y: t.height },
      ];

// Reconstruct the placed polygon from a resolveBuilding result.
const placedRing = (templateName, placed) => {
  const rad = (placed.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return ringOf(TEMPLATES[templateName]).map((p) => ({
    x: placed.translate.x + p.x * cos - p.y * sin,
    y: placed.translate.y + p.x * sin + p.y * cos,
  }));
};

// Compare two polygons as point SETS (order-independent), within tolerance.
const sameSet = (a, b) => {
  expect(a.length).toBe(b.length);
  const key = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const sa = [...a].map(key).sort();
  const sb = [...b].map(key).sort();
  for (let i = 0; i < sa.length; i++) {
    const [ax, ay] = sa[i].split(",").map(Number);
    const [bx, by] = sb[i].split(",").map(Number);
    expect(ax).toBeCloseTo(bx, 1);
    expect(ay).toBeCloseTo(by, 1);
  }
};

const roundTrip = (piece, getParent) => {
  const placement = featureBuildingPlacement(piece, lookupFootprint, getParent);
  expect(placement.mirror).toBe(false);
  const placed = resolveBuilding(placement, TEMPLATES, CANVAS);
  expect(placed).toHaveLength(1); // mirror:false -> single placement
  const expected = resolvePiece(piece, lookupFootprint, getParent);
  sameSet(placedRing(placement.type, placed[0]), expected);
  return placement;
};

describe("featureBuildingPlacement", () => {
  it("places a named pipe (5.5x1 rectangle)", () => {
    const p = roundTrip({
      template: "pipe",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    });
    expect(p.type).toBe("pipe");
  });

  it("places a rotated named barricade (8-vertex polygon)", () => {
    const p = roundTrip({
      template: "barricade",
      position: { x: 25, y: 15 },
      rotation_degrees: 35,
    });
    expect(p.type).toBe("barricade");
  });

  it("places a parented barricade (composes the parent-area transform)", () => {
    const parent = {
      id: "a",
      template: "area-large",
      piece_type: "area",
      position: { x: 30, y: 22 },
      rotation_degrees: 30,
    };
    const child = {
      template: "barricade",
      parent_area_id: "a",
      position: { x: 1, y: -1 },
      rotation_degrees: 0,
    };
    const p = roundTrip(child, (id) => (id === "a" ? parent : undefined));
    expect(p.type).toBe("barricade");
  });
});
