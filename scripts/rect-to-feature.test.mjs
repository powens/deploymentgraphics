import { describe, it, expect } from "vitest";
import { ringMismatch } from "../src/geometry.ts";
import { placedRing, resolveFeature } from "../src/placement.ts";
import { loadCorpus } from "./terrain-corpus.mjs";
import { isRectFeaturePart, rectFeaturePlacement } from "./rect-to-feature.mjs";

const { missionLayouts } = loadCorpus();

const CANVAS = { width: 60, height: 44 };

// Absolute outline of a placed rectangle feature, drawn the way makeFeatures
// does. Reflection-symmetric, so it matches regardless of mirror parity.
function featureFootprint(pl) {
  const { width: w, height: h } = pl;
  const local = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  // mirror:false, so the primary is the only `Placed`.
  const [placed] = resolveFeature(pl, CANVAS);
  return placedRing(local, placed);
}

// One representative piece (with its layout) per rectangle-feature part.
const sample = {};
for (const L of missionLayouts) {
  for (const p of L.pieces) {
    if (!isRectFeaturePart(p.part)) continue;
    sample[p.part] ??= { piece: p, layout: L };
  }
}

describe("isRectFeaturePart", () => {
  it("accepts generator and tower, rejects others", () => {
    expect(isRectFeaturePart("generator")).toBe(true);
    expect(isRectFeaturePart("tower")).toBe(true);
    expect(isRectFeaturePart("long-barrier")).toBe(false);
    expect(isRectFeaturePart("corner")).toBe(false);
  });
});

describe("rectFeaturePlacement round-trips through resolvePiece", () => {
  it("covers generator and tower", () => {
    expect(Object.keys(sample).sort()).toEqual(["generator", "tower"]);
  });

  const EXPECTED = {
    generator: { type: "generator", color: "teal" },
    tower: { type: "gantry", color: "indigo" },
  };
  for (const [part, { piece, layout }] of Object.entries(sample)) {
    it(`reproduces the ${part} footprint`, () => {
      const pl = rectFeaturePlacement(piece, layout);
      expect({ type: pl.type, color: pl.color }).toEqual(EXPECTED[part]);
      const target = layout.resolve(piece).ring;
      expect(ringMismatch(featureFootprint(pl), target)).toBeLessThan(0.02);
    });
  }
});
