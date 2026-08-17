import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolvePiece } from "./terrain-resolver.mjs";
import {
  isRuinTemplate,
  isLFootprint,
  ruinFeaturePlacement,
  ruinFeatures,
} from "./ruin-to-feature.mjs";

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../static/data/terrain/source/40kdc/${name}`, import.meta.url),
      "utf8",
    ),
  );
import { normalizeLayout } from "./battlemaster-normalize.mjs";

const rawLayouts = read("terrain-layouts.json");
const rawTemplates = read("terrain-templates.json");
const templatesById = new Map(rawTemplates.map((t) => [t.id, t]));
// Upstream now ships ruins as `features[]` on composite templates; normalize
// back to the legacy piece vocabulary these converters consume.
const layouts = rawLayouts.map((l) => normalizeLayout(l, templatesById));
const fpById = new Map(rawTemplates.map((t) => [t.id, t.footprint]));
const lookupFootprint = (id) => fpById.get(id);

// Absolute outline of a placed l-ruin feature (mirrors makeFeatures' transform
// and the lRuin / lRuinMirror wall paths). Used to check the emitted placement
// reproduces resolvePiece's footprint.
function featureFootprint(pl) {
  const { x, y, width: w, height: h } = pl;
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
  const t = ((pl.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = w / 2;
  const cy = h / 2;
  return local.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: (dx * cos - dy * sin) + cx + x,
      y: (dx * sin + dy * cos) + cy + y,
    };
  });
}

// Max distance from each vertex of one ring to the nearest vertex of the other,
// in both directions (Hausdorff over vertex sets).
function ringMismatch(a, b) {
  const near = (p, ring) =>
    Math.min(...ring.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
  return Math.max(
    ...a.map((p) => near(p, b)),
    ...b.map((p) => near(p, a)),
  );
}

const getParentFor = (L) => {
  const byId = new Map(L.pieces.map((p) => [p.id, p]));
  return (id) => byId.get(id);
};

// One representative L-ruin piece per corner template, drawn from the source.
const sample = {};
for (const L of layouts) {
  const getParent = getParentFor(L);
  for (const p of L.pieces) {
    if (!isRuinTemplate(p.template)) continue;
    const fp = p.footprint ?? lookupFootprint(p.template);
    if (!isLFootprint(fp)) continue;
    sample[p.template] ??= { piece: p, getParent };
  }
}

describe("isLFootprint", () => {
  it("accepts an L template and rejects a bar", () => {
    expect(isLFootprint(fpById.get("corner-tiny"))).toBe(true);
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

  for (const [template, { piece, getParent }] of Object.entries(sample)) {
    it(`reproduces the ${template} footprint`, () => {
      const pl = ruinFeaturePlacement(piece, lookupFootprint, getParent, false);
      const target = resolvePiece(piece, lookupFootprint, getParent);
      expect(ringMismatch(featureFootprint(pl), target)).toBeLessThan(0.02);
    });
  }

  it("picks the mirror variant for opposite-chirality templates", () => {
    const right = sample["corner-ruin-right"];
    const pl = ruinFeaturePlacement(
      right.piece,
      lookupFootprint,
      right.getParent,
      false,
    );
    expect(pl.type).toBe("l-ruin-mirror");
    const left = sample["corner-ruin-left"];
    expect(
      ruinFeaturePlacement(left.piece, lookupFootprint, left.getParent, false)
        .type,
    ).toBe("l-ruin");
  });

  it("emits the -roof variant when roofed", () => {
    const left = sample["corner-ruin-left"];
    expect(
      ruinFeaturePlacement(left.piece, lookupFootprint, left.getParent, true)
        .type,
    ).toBe("l-ruin-roof");
    const right = sample["corner-ruin-right"];
    expect(
      ruinFeaturePlacement(right.piece, lookupFootprint, right.getParent, true)
        .type,
    ).toBe("l-ruin-roof-mirror");
  });
});

describe("ruinFeatures", () => {
  it("converts every whole-L ruin and consumes the catwalks", () => {
    const L = layouts.find((l) => l.id === "purge-the-foe-vs-purge-the-foe-2");
    const { features, consumedIds } = ruinFeatures(L, lookupFootprint, getParentFor(L));
    const catwalks = L.pieces.filter((p) => p.template === "catwalk");
    const ruinPieces = L.pieces.filter((p) => isRuinTemplate(p.template));
    expect(features.length).toBe(ruinPieces.length);
    for (const p of [...catwalks, ...ruinPieces]) {
      expect(consumedIds.has(p.id)).toBe(true);
    }
    for (const f of features) {
      expect([
        "l-ruin",
        "l-ruin-mirror",
        "l-ruin-roof",
        "l-ruin-roof-mirror",
      ]).toContain(f.type);
    }
  });

  it("roofs the 20 catwalks that sit on a ruin, and nothing else", () => {
    // Distances from each of the 90 catwalks to the nearest ruin centre, sorted:
    //
    //   shipped   2.96 2.96 [2.97 x18] | 3.26 3.26 3.36 3.36 | 3.85 x4 | 4.39 ..
    //   pre-pull  2.99 2.99 [3.09 x12] 3.15 x6 |            | 4.01 4.01 4.03 ..
    //
    // Both corpora put exactly 20 catwalks in the tight leading cluster - those
    // are the ones resting on a ruin - and the pre-pull corpus separates them
    // from the rest by a clean 0.86in gap. Normalization moves the cluster by
    // under 0.2in, so the population is upstream's geometry, not something this
    // pipeline introduces. ROOF_DISTANCE = 3.1in sits in the gap after the
    // cluster and selects exactly those 20, with ~0.13in of margin below and
    // ~0.16in above. If this count ever moves, check the distances above before
    // assuming the data changed: at that margin the threshold is the fragile
    // part. It was 3in until the anchor fix, which is why the pre-pull corpus
    // only ever roofed 2 of its 20 - 3in cut through the middle of that cluster.
    const catwalks = layouts
      .filter((l) => l.mission_matchup_id)
      .flatMap((l) => l.pieces)
      .filter((p) => p.template === "catwalk");
    expect(catwalks.length).toBe(90);
    const features = layouts
      .filter((l) => l.mission_matchup_id)
      .flatMap((l) => ruinFeatures(l, lookupFootprint, getParentFor(l)).features);
    expect(features.length).toBe(720);
    expect(features.filter((f) => f.type.includes("roof")).length).toBe(20);
  });

  it("emits 16 whole-L ruins for every mission layout", () => {
    // Upstream filled the two variants that used to be short (12 each), so the
    // corpus is now uniform - this is what retires the gw.yml patch overlay.
    for (const L of layouts.filter((l) => l.mission_matchup_id)) {
      const { features } = ruinFeatures(L, lookupFootprint, getParentFor(L));
      expect(features.length, L.id).toBe(16);
    }
  });
});
