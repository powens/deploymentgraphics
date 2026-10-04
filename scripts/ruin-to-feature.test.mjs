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
import { isRuinPart, ruinFeaturePlacement } from "./ruin-to-feature.mjs";
import { layoutPlacements } from "./layout-to-placements.mjs";

const { missionLayouts, rawLayouts, templatesById, gwTemplates } = loadCorpus();

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
  const { local, ring } = entry.layout.resolve(entry.piece);
  const corners = boundsCorners(local); // TL, TR, BR, BL
  const at = corners.map((c) => local.findIndex((p) => distance(p, c) < 1e-6));
  const openIdx = at.indexOf(-1);
  if (openIdx === -1 || at.filter((i) => i >= 0).length !== 3) {
    throw new Error("ruin footprint is not an L (expected 3 of 4 bbox corners)");
  }
  return ring[at[(openIdx + 2) % 4]];
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

// One representative L-ruin piece (with its layout) per part.
const sample = {};
for (const L of missionLayouts) {
  for (const p of L.pieces) {
    if (!isRuinPart(p.part)) continue;
    sample[p.part] ??= { piece: p, layout: L };
  }
}

describe("ruinFeaturePlacement round-trips through resolvePiece", () => {
  it("covers every L-ruin part", () => {
    expect(Object.keys(sample).sort()).toEqual([
      "ab",
      "cd",
      "co",
      "corner",
      "ef",
      "gh",
      "small-l",
      "small-l-flip",
    ]);
  });

  const placementOf = ({ piece, layout }) => ruinFeaturePlacement(piece, layout);

  for (const [part, entry] of Object.entries(sample)) {
    it(`reproduces the ${part} footprint`, () => {
      const target = entry.layout.resolve(entry.piece).ring;
      expect(
        ringMismatch(featureFootprint(placementOf(entry)), target),
      ).toBeLessThan(0.02);
    });
  }

  it("draws the two hands of one model with the two variants", () => {
    expect(placementOf(sample["small-l"]).type).toBe("l-ruin-mirror");
    expect(placementOf(sample["small-l-flip"]).type).toBe("l-ruin");
  });

  it("throws on a part that is not an L-ruin", () => {
    const { piece, layout } = sample.ab;
    expect(() =>
      ruinFeaturePlacement({ ...piece, part: "tower" }, layout),
    ).toThrow(/part tower is not an L-ruin part/);
  });

  for (const [part, entry] of Object.entries(sample)) {
    it(`lands the ${part} outer corner on the resolved one`, () => {
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
// ruin, so its geometry primitives get their own test. Upstream's catwalk is
// the `pipes` part.
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
  it("emits an l-ruin or l-ruin-mirror for every L-ruin piece", () => {
    const L = missionLayouts.find((l) => l.id === "bm-purge-vs-purge-02");
    const features = ruinsOf(L);
    expect(features.length).toBe(
      L.pieces.filter((p) => isRuinPart(p.part)).length,
    );
    for (const f of features) {
      expect(["l-ruin", "l-ruin-mirror"]).toContain(f.type);
    }
  });

  it("emits no -roof variant, because no catwalk rests on a ruin", () => {
    // battlemaster-normalize.mjs drops the `pipes` part, so this reads it where
    // upstream ships it: the whole of its own ShortLine composite, never a
    // sibling of a ruin part. Measured against upstream's traced outline of
    // that composite, the catwalk-to-nearest-ruin gaps over all 90, sorted:
    //
    //   0.459 x2  0.498 x4  0.499 x6  0.501 x4 .. 6.724
    //
    // The check is about contact, not centre distance. If a future pull seats
    // a catwalk on a ruin, this fails and a roof variant is needed.
    const features = missionLayouts.flatMap(ruinsOf);
    expect(features.length).toBe(720);
    expect(features.filter((f) => f.type.includes("roof")).length).toBe(0);

    const partOf = (id) =>
      id.replace(/^bm-part-/, "").replace(/-[0-9a-f]{10}$/, "");
    const raw = rawLayouts.filter((l) => l.mission_matchup_id);
    let catwalks = 0;
    let touching = 0;
    let siblings = 0;
    const gaps = [];
    raw.forEach((src, i) => {
      const L = missionLayouts[i];
      const ruins = L.pieces
        .filter((p) => isRuinPart(p.part))
        .map((p) => ({ p, ring: L.resolve(p).ring }));
      for (const area of src.pieces) {
        const { features: parts } = templatesById.get(area.template);
        if (!parts.some((f) => partOf(f.template) === "pipes")) continue;
        catwalks += 1;
        const { ring } = src.resolve(area);
        let nearest = Infinity;
        for (const r of ruins) {
          nearest = Math.min(nearest, ringGap(ring, r.ring));
          if (ringsOverlap(ring, r.ring)) touching += 1;
          if (r.p.parent_area_id === area.id) siblings += 1;
        }
        gaps.push(nearest);
      }
    });
    expect(catwalks).toBe(90);
    expect(touching).toBe(0);
    expect(siblings).toBe(0);
    expect(Math.min(...gaps)).toBeGreaterThan(0);
  });

  it("emits 16 whole-L ruins for every mission layout", () => {
    for (const L of missionLayouts) {
      expect(ruinsOf(L).length, L.id).toBe(16);
    }
  });
});
