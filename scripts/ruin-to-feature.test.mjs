import { describe, it, expect } from "vitest";
import {
  boundsCorners,
  distance,
  pointInRing as inRing,
  ringGap,
  ringMismatch,
  ringsOverlap,
} from "../src/geometry.ts";
import { placedRing, resolveFeature } from "../src/placement.ts";
import { loadCorpus } from "./terrain-corpus.mjs";
import { footprintPolygon } from "./terrain-resolver.mjs";
import {
  isRuinTemplate,
  isLFootprint,
  ruinFeaturePlacement,
} from "./ruin-to-feature.mjs";
import { layoutPlacements } from "./layout-to-placements.mjs";

const { missionLayouts, footprintOf, gwTemplates } = loadCorpus();

const ruinsOf = (L) =>
  layoutPlacements(L, gwTemplates).features.filter((f) =>
    f.type.startsWith("l-ruin"),
  );

const CANVAS = { width: 60, height: 44 };

/**
 * The outer corner of a piece's resolved footprint, derived independently of
 * the converter (diagonal from the missing bbox corner). Found on the unrotated
 * footprint and carried as a vertex index, since a rotated piece's bbox is not
 * the rotated local bbox. Nearest-vertex matching would pass a fit that pinned
 * the wrong corner.
 */
const outerCornerOf = (entry) => {
  const footprint =
    entry.piece.footprint ?? entry.layout.footprintOf(entry.piece.template);
  const local = footprintPolygon(footprint);
  const corners = boundsCorners(local); // TL, TR, BR, BL
  const at = corners.map((c) => local.findIndex((p) => distance(p, c) < 1e-6));
  const openIdx = at.indexOf(-1);
  if (openIdx === -1 || at.filter((i) => i >= 0).length !== 3) {
    throw new Error("ruin footprint is not an L (expected 3 of 4 bbox corners)");
  }
  return entry.layout.resolve(entry.piece)[at[(openIdx + 2) % 4]];
};

// Absolute outline of a placed l-ruin feature, drawn the way makeFeatures does.
function featureFootprint(pl) {
  const { width: w, height: h } = pl;
  const wall = Math.min(0.5, w, h);
  const mirror = pl.type.includes("mirror");
  const local = mirror
    ? [
        { x: w, y: 0 },
        { x: w - wall, y: 0 },
        { x: w - wall, y: h - wall },
        { x: 0, y: h - wall },
        { x: 0, y: h },
        { x: w, y: h },
      ]
    : [
        { x: 0, y: 0 },
        { x: wall, y: 0 },
        { x: wall, y: h - wall },
        { x: w, y: h - wall },
        { x: w, y: h },
        { x: 0, y: h },
      ];
  // mirror:false, so the primary is the only `Placed`.
  const [placed] = resolveFeature(pl, CANVAS);
  return placedRing(local, placed);
}

// One representative L-ruin piece (with its layout) per corner template.
const sample = {};
for (const L of missionLayouts) {
  for (const p of L.pieces) {
    if (!isRuinTemplate(p.template)) continue;
    const fp = p.footprint ?? footprintOf(p.template);
    if (!isLFootprint(fp)) continue;
    sample[p.template] ??= { piece: p, layout: L };
  }
}

describe("isLFootprint", () => {
  it("accepts an L template and rejects a bar", () => {
    expect(isLFootprint(footprintOf("corner-tiny"))).toBe(true);
    expect(
      isLFootprint({ type: "rectangle", width: 2, height: 0.25 }),
    ).toBe(false);
  });
});

describe("ruinFeaturePlacement round-trips through resolvePiece", () => {
  it("covers all six corner templates", () => {
    expect(Object.keys(sample).sort()).toEqual([
      "corner-ruin-balanced-left",
      "corner-ruin-balanced-right",
      "corner-ruin-left",
      "corner-ruin-right",
      "corner-short",
      "corner-tiny",
    ]);
  });

  const placementOf = ({ piece, layout }) => ruinFeaturePlacement(piece, layout);

  for (const [template, entry] of Object.entries(sample)) {
    it(`reproduces the ${template} footprint`, () => {
      const target = entry.layout.resolve(entry.piece);
      expect(
        ringMismatch(featureFootprint(placementOf(entry)), target),
      ).toBeLessThan(0.02);
    });
  }

  it("picks the mirror variant for opposite-chirality templates", () => {
    expect(placementOf(sample["corner-ruin-right"]).type).toBe("l-ruin-mirror");
    expect(placementOf(sample["corner-ruin-left"]).type).toBe("l-ruin");
  });

  for (const [template, entry] of Object.entries(sample)) {
    it(`lands the ${template} outer corner on the resolved one`, () => {
      // Drawn through the placement transform, so this checks the pivot
      // convention rather than a pinned constant.
      const placement = placementOf(entry);
      const { width: w, height: h } = placement;
      const localOuter =
        placement.type === "l-ruin" ? { x: 0, y: h } : { x: w, y: h };
      const [placed] = resolveFeature(placement, CANVAS);
      const [drawn] = placedRing([localOuter], placed);

      const outer = outerCornerOf(entry);
      expect(distance(drawn, outer)).toBeLessThan(0.01);
    });
  }

});

// The corpus roofing check below is the only tripwire for a catwalk seated on a
// ruin, so its geometry primitives get their own test.
describe("roofing guard geometry", () => {
  // Outer corner at the origin: a 5x0.5in horizontal arm and a 0.5x4.5in
  // vertical one, the shape of a resolved l-ruin.
  const ruin = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 4.5 },
    { x: 0, y: 4.5 },
  ];

  it("sees a catwalk laid across a ruin arm", () => {
    // Neither ring holds a vertex of the other and every endpoint-to-segment
    // distance is 0.5; only the edge crossing gives it away.
    const across = [
      { x: -3, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: -3, y: 4 },
    ];
    expect(across.some((p) => inRing(p, ruin))).toBe(false);
    expect(ruin.some((p) => inRing(p, across))).toBe(false);
    expect(ringsOverlap(across, ruin)).toBe(true);
    expect(ringGap(across, ruin)).toBe(0);
  });

  it("still calls a clear catwalk clear", () => {
    const clear = [
      { x: -3, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 8 },
      { x: -3, y: 8 },
    ];
    expect(ringsOverlap(clear, ruin)).toBe(false);
    expect(ringGap(clear, ruin)).toBeCloseTo(1.5, 10);
  });

  it("sees a catwalk resting on the outer corner", () => {
    const onCorner = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ];
    expect(ringsOverlap(onCorner, ruin)).toBe(true);
    expect(ringGap(onCorner, ruin)).toBe(0);
  });
});

describe("ruins over the corpus", () => {
  it("emits an l-ruin or l-ruin-mirror for every corner piece", () => {
    const L = missionLayouts.find((l) => l.id === "bm-purge-vs-purge-02");
    const features = ruinsOf(L);
    expect(features.length).toBe(
      L.pieces.filter((p) => isRuinTemplate(p.template)).length,
    );
    for (const f of features) {
      expect(["l-ruin", "l-ruin-mirror"]).toContain(f.type);
    }
  });

  it("emits no -roof variant, because no catwalk rests on a ruin", () => {
    // Upstream ships `pipes` (the catwalk part) as its own standalone composite
    // (composite-03, composite-30), never as a sibling of a ruin part.
    // Catwalk-to-nearest-ruin gaps over all 90, sorted:
    //
    //   0.002 x2  0.005 x4 | 0.435 x2  0.461 x2  0.498 x12  0.502 x10 .. 6.98
    //
    // The closest six sit 3.996-5.037in centre-to-centre, so a centroid
    // threshold picks the wrong ones; the check is about contact. If a future
    // pull seats a catwalk on a ruin, this fails and a roof variant is needed.
    const missions = missionLayouts;
    const catwalks = missions
      .flatMap((l) => l.pieces)
      .filter((p) => p.template === "catwalk");
    expect(catwalks.length).toBe(90);
    const features = missions.flatMap(ruinsOf);
    expect(features.length).toBe(720);
    expect(features.filter((f) => f.type.includes("roof")).length).toBe(0);

    let touching = 0;
    let siblings = 0;
    let minGap = Infinity;
    for (const L of missions) {
      const ruins = L.pieces
        .filter(
          (p) =>
            isRuinTemplate(p.template) &&
            isLFootprint(p.footprint ?? footprintOf(p.template)),
        )
        .map((p) => ({ p, ring: L.resolve(p) }));
      for (const p of L.pieces.filter((q) => q.template === "catwalk")) {
        const ring = L.resolve(p);
        for (const r of ruins) {
          const gap = ringGap(ring, r.ring);
          minGap = Math.min(minGap, gap);
          if (ringsOverlap(ring, r.ring)) {
            touching += 1;
          }
          if (p.parent_area_id && p.parent_area_id === r.p.parent_area_id) {
            siblings += 1;
          }
        }
      }
    }
    expect(touching).toBe(0);
    expect(siblings).toBe(0);
    expect(minGap).toBeGreaterThan(0);
  });

  it("emits 16 whole-L ruins for every mission layout", () => {
    for (const L of missionLayouts) {
      expect(ruinsOf(L).length, L.id).toBe(16);
    }
  });
});
