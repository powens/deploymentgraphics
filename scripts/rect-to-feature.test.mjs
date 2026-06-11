import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolvePiece } from "./terrain-resolver.mjs";
import {
  isRectFeatureTemplate,
  rectFeaturePlacement,
  rectFeatures,
} from "./rect-to-feature.mjs";

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../static/data/terrain/source/40kdc/${name}`, import.meta.url),
      "utf8",
    ),
  );
const layouts = read("terrain-layouts.json");
const templates = read("terrain-templates.json");
const fpById = new Map(templates.map((t) => [t.id, t.footprint]));
const lookupFootprint = (id) => fpById.get(id);

const getParentFor = (L) => {
  const byId = new Map(L.pieces.map((p) => [p.id, p]));
  return (id) => byId.get(id);
};

// Absolute outline of a placed rectangle feature: the box corners after
// makeFeatures' translate(x,y) . rotate(rotation, w/2, h/2).
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

// Max distance from each vertex of one ring to the nearest vertex of the other,
// in both directions (Hausdorff over vertex sets). Outline is reflection-
// symmetric, so this matches regardless of mirror parity.
function ringMismatch(a, b) {
  const near = (p, ring) =>
    Math.min(...ring.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
  return Math.max(...a.map((p) => near(p, b)), ...b.map((p) => near(p, a)));
}

// One representative piece per rectangle-feature template, drawn from the source.
const sample = {};
for (const L of layouts) {
  const getParent = getParentFor(L);
  for (const p of L.pieces) {
    if (!isRectFeatureTemplate(p.template)) continue;
    sample[p.template] ??= { piece: p, getParent };
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

  for (const [template, { piece, getParent }] of Object.entries(sample)) {
    it(`reproduces the ${template} footprint`, () => {
      const pl = rectFeaturePlacement(piece, lookupFootprint, getParent);
      expect(pl.type).toBe(template);
      expect(pl.color).toBe("gunmetal");
      const target = resolvePiece(piece, lookupFootprint, getParent);
      expect(ringMismatch(featureFootprint(pl), target)).toBeLessThan(0.02);
    });
  }
});

describe("rectFeatures", () => {
  it("converts every generator and gantry piece and consumes their ids", () => {
    const L = layouts.find((l) => l.id === "gw-11e-crucible");
    const { features, consumedIds } = rectFeatures(L, lookupFootprint, getParentFor(L));
    const rectPieces = L.pieces.filter((p) => isRectFeatureTemplate(p.template));
    expect(features.length).toBe(rectPieces.length);
    for (const p of rectPieces) expect(consumedIds.has(p.id)).toBe(true);
    for (const f of features) {
      expect(["generator", "gantry"]).toContain(f.type);
      expect(f.mirror).toBe(false);
    }
  });
});
