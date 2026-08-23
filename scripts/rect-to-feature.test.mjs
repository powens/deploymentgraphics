import { describe, it, expect } from "vitest";
import { ringMismatch } from "../src/geometry.ts";
import { placedRing, resolveFeature } from "../src/placement.ts";
import { loadCorpus } from "./terrain-corpus.mjs";
import {
  isRectFeatureTemplate,
  rectFeaturePlacement,
} from "./rect-to-feature.mjs";

const { layouts, footprintOf } = loadCorpus();

const CANVAS = { width: 60, height: 44 };

// Absolute outline of a placed rectangle feature: the box corners drawn through
// the placement seam, the way makeFeatures draws them. The outline is
// reflection-symmetric, so ringMismatch against resolvePiece's ring matches
// regardless of mirror parity — no mirror variant is needed to compare them.
function featureFootprint(pl) {
  const { width: w, height: h } = pl;
  const local = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  // Every emitted rect-feature placement is mirror:false, so the primary is
  // the only `Placed`.
  const [placed] = resolveFeature(pl, CANVAS);
  return placedRing(local, placed);
}

// One representative piece per rectangle-feature template, drawn from the
// source. The piece rides along with its layout, which carries the lookups
// needed to resolve it.
const sample = {};
for (const L of layouts) {
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
      const pl = rectFeaturePlacement(piece, footprintOf, layout.parentOf);
      expect(pl.type).toBe(template);
      expect(pl.color).toBe(template === "generator" ? "teal" : "indigo");
      const target = layout.resolve(piece);
      expect(ringMismatch(featureFootprint(pl), target)).toBeLessThan(0.02);
    });
  }
});
