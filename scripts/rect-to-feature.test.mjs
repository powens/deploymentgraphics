import { describe, it, expect } from "vitest";
import { ringMismatch } from "../src/geometry.ts";
import { placedRing, resolveFeature } from "../src/placement.ts";
import { loadCorpus } from "./terrain-corpus.mjs";
import {
  isRectFeatureTemplate,
  rectFeaturePlacement,
} from "./rect-to-feature.mjs";

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

// One representative piece (with its layout) per rectangle-feature template.
const sample = {};
for (const L of missionLayouts) {
  for (const p of L.pieces) {
    if (!isRectFeatureTemplate(p.template)) continue;
    sample[p.template] ??= { piece: p, layout: L };
  }
}

describe("isRectFeatureTemplate", () => {
  it("accepts generator and gantry, rejects others", () => {
    expect(isRectFeatureTemplate("generator")).toBe(true);
    expect(isRectFeatureTemplate("gantry")).toBe(true);
    expect(isRectFeatureTemplate("pipe")).toBe(false);
    expect(isRectFeatureTemplate("corner-tiny")).toBe(false);
  });
});

describe("rectFeaturePlacement round-trips through resolvePiece", () => {
  it("covers generator and gantry", () => {
    expect(Object.keys(sample).sort()).toEqual(["gantry", "generator"]);
  });

  for (const [template, { piece, layout }] of Object.entries(sample)) {
    it(`reproduces the ${template} footprint`, () => {
      const pl = rectFeaturePlacement(piece, layout);
      expect(pl.type).toBe(template);
      expect(pl.color).toBe(template === "generator" ? "teal" : "indigo");
      const target = layout.resolve(piece);
      expect(ringMismatch(featureFootprint(pl), target)).toBeLessThan(0.02);
    });
  }
});
