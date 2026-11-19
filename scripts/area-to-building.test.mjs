import { describe, it, expect } from "vitest";
import { areaBuildingPlacement, areaPiece } from "./area-to-building.mjs";
import { loadCorpus, withLookups } from "./terrain-corpus.mjs";
import { ringMismatch, shapeDistance } from "../src/geometry.ts";
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
      size_class: "LongLine",
      template: "area-long-line",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    });
  });

  it("places a rotated transpose piece", () => {
    roundTrip({
      size_class: "BigRect",
      template: "area-large",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 55,
    });
  });

  it("places an un-mirrored trapezoid via shoe-mirror", () => {
    const p = roundTrip({
      size_class: "Triangle",
      template: "area-trapezoid",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 30,
    });
    expect(p.type).toBe("shoe-mirror");
  });

  it("places a mirrored trapezoid via shoe", () => {
    const p = roundTrip({
      size_class: "Triangle",
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
      size_class: "SmallRect",
      template: "area-medium",
      piece_type: "area",
      position: { x: 25, y: 15 },
      rotation_degrees: 137,
      mirror: "horizontal",
    });
  });

  it("throws for a size class with no gw mapping", () => {
    const piece = {
      size_class: "Hexagon",
      template: "area-large",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    };
    expect(() =>
      areaBuildingPlacement(piece, layoutOf(piece), GW_TEMPLATES),
    ).toThrow(/no gw template mapping for size class Hexagon/);
  });

  it("throws for an area not drawn by its class's archetype", () => {
    const piece = {
      id: "a1",
      size_class: "BigRect",
      template: "area-medium",
      piece_type: "area",
      position: { x: 30, y: 20 },
      rotation_degrees: 0,
    };
    expect(() =>
      areaBuildingPlacement(piece, layoutOf(piece), GW_TEMPLATES),
    ).toThrow(/a1 of size class BigRect is not drawn by its archetype area-large/);
  });

  it("throws for a mapped archetype with no 40kdc footprint", () => {
    const piece = {
      id: "a1",
      size_class: "LongLine",
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

  // Both halves together, against upstream's own outline for the one class
  // whose archetype is not symmetric.
  it("keeps the trapezoid areas on their upstream outline", () => {
    const corpus = loadCorpus();
    let worst = 0;
    let checked = 0;
    for (const src of corpus.rawLayouts.filter((l) => l.mission_matchup_id)) {
      for (const piece of src.pieces) {
        const composite = corpus.templatesById.get(piece.template);
        if (composite.name.split(" ")[1] !== "Triangle") continue;
        const { area } = areaPiece(piece, composite, corpus.templatesById);
        const placement = areaBuildingPlacement(
          area,
          withLookups({ id: src.id, pieces: [area] }, corpus.footprintOf),
          corpus.gwTemplates,
        );
        // Drawn through placement.ts rather than re-deriving the pin math,
        // so a pivot mistake cannot hide in both converter and check.
        const [drawn] = buildingRings(placement, corpus.gwTemplates, CANVAS);
        const truth = src.resolve(piece).ring;
        worst = Math.max(worst, shapeDistance(drawn, truth));
        checked++;
      }
    }
    expect(checked).toBe(90);
    // Upstream's outline is an independent trace of the trapezoid, so a
    // residual remains. The tolerance only has to catch a wrong pivot: the
    // next-best variant of this composite sits 5.2in away.
    expect(worst).toBeLessThan(1.0);
  });
});
