import { describe, it, expect } from "vitest";
import { ringMismatch } from "./terrain-resolver.mjs";
import { loadCorpus } from "./terrain-corpus.mjs";
import {
  isRectFeatureTemplate,
  rectFeaturePlacement,
} from "./rect-to-feature.mjs";

const { layouts, footprintOf } = loadCorpus();

// Absolute outline of a placed rectangle feature: the box corners after
// makeFeatures' translate(x,y) . rotate(rotation, w/2, h/2). The outline is
// reflection-symmetric, so ringMismatch against resolvePiece's ring matches
// regardless of mirror parity — no mirror variant is needed to compare them.
function featureFootprint(pl) {
  const { x, y, width: w, height: h, rotation = 0 } = pl;
  const local = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const t = (rotation * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = w / 2;
  const cy = h / 2;
  return local.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: dx * cos - dy * sin + cx + x,
      y: dx * sin + dy * cos + cy + y,
    };
  });
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
