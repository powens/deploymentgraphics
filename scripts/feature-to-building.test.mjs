import { describe, it, expect } from "vitest";
import { featureBuildingPlacement } from "./feature-to-building.mjs";
import { withLookups } from "./terrain-corpus.mjs";
import { ringMismatch } from "../src/geometry.ts";
import { buildingRings } from "../src/placement.ts";

const CANVAS = { width: 60, height: 44 };

// The two target templates, plus a parent area for the parented-piece test.
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

const FOOTPRINTS = {
  pipe: { type: "rectangle", width: 5.5, height: 1 },
  barricade: { type: "polygon", points: TEMPLATES.barricade.points },
  "area-large": { type: "rectangle", width: 11.5, height: 7 },
};
const lookupFootprint = (id) => FOOTPRINTS[id];

const layoutOf = (piece, parent) =>
  withLookups(
    { id: "t", pieces: parent ? [parent, piece] : [piece] },
    lookupFootprint,
  );

const roundTrip = (piece, parent) => {
  const layout = layoutOf(piece, parent);
  const placement = featureBuildingPlacement(piece, layout, TEMPLATES);
  expect(placement.mirror).toBe(false);
  const rings = buildingRings(placement, TEMPLATES, CANVAS);
  expect(rings).toHaveLength(1);
  // Same vertices in any order, within tolerance.
  const target = layout.resolve(piece).ring;
  expect(rings[0]).toHaveLength(target.length);
  expect(ringMismatch(rings[0], target)).toBeLessThan(0.05);
  return placement;
};

describe("featureBuildingPlacement", () => {
  it("places a named pipe (5.5x1 rectangle)", () => {
    const p = roundTrip({
      part: "long-barrier",
      template: "pipe",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    });
    expect(p.type).toBe("pipe");
  });

  it("places a rotated named barricade (8-vertex polygon)", () => {
    const p = roundTrip({
      part: "short-barrier",
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
      part: "short-barrier",
      template: "barricade",
      parent_area_id: "a",
      position: { x: 1, y: -1 },
      rotation_degrees: 0,
    };
    const p = roundTrip(child, parent);
    expect(p.type).toBe("barricade");
  });

  it("throws when a barrier's footprint loses the template's profile", () => {
    // The 3.5in long edge still matches; only the vertex count sees the reshape.
    const piece = {
      id: "b1",
      part: "short-barrier",
      footprint: { type: "rectangle", width: 3.5, height: 1 },
      position: { x: 10, y: 10 },
    };
    const layout = withLookups({ id: "t", pieces: [piece] }, lookupFootprint);
    expect(() => featureBuildingPlacement(piece, layout, TEMPLATES)).toThrow(
      /part short-barrier footprint \(long edge 3.500, 4 verts\)/,
    );
  });
});
