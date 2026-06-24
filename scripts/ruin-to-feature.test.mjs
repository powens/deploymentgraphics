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
const layouts = read("terrain-layouts.json");
const templates = read("terrain-templates.json");
const fpById = new Map(templates.map((t) => [t.id, t.footprint]));
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
  it("roofs the whole-L ruins that sit under catwalks", () => {
    // purge-the-foe-vs-purge-the-foe-2 has 16 whole-L corner ruins and two
    // catwalks, each catwalk sitting on one ruin. (No vendored layout still
    // uses the split wall-segment bar-pair encoding the crucible relied on.)
    const L = layouts.find((l) => l.id === "purge-the-foe-vs-purge-the-foe-2");
    const { features, consumedIds } = ruinFeatures(L, lookupFootprint, getParentFor(L));
    const catwalks = L.pieces.filter((p) => p.template === "catwalk");
    const ruinPieces = L.pieces.filter((p) => isRuinTemplate(p.template));
    // Each whole-L ruin piece -> one feature.
    expect(features.length).toBe(ruinPieces.length);
    // Every catwalk and ruin piece is consumed (not re-emitted as area_terrain).
    for (const p of [...catwalks, ...ruinPieces]) {
      expect(consumedIds.has(p.id)).toBe(true);
    }
    // The two ruins under catwalks are roofed; roofs use the -roof variant.
    const roofs = features.filter((f) => f.type.includes("roof"));
    expect(roofs.length).toBe(2);
    for (const f of features) {
      expect(["l-ruin", "l-ruin-mirror", "l-ruin-roof", "l-ruin-roof-mirror"]).toContain(
        f.type,
      );
    }
  });

  it("converts whole-L ruins and drops catwalks without roofing them", () => {
    const L = layouts.find((l) => l.id === "take-and-hold-vs-disruption-1");
    const { features, consumedIds } = ruinFeatures(L, lookupFootprint, getParentFor(L));
    const ruinPieces = L.pieces.filter((p) => isRuinTemplate(p.template));
    expect(features.length).toBe(ruinPieces.length); // each L piece -> one feature
    // Catwalks here are free-standing (~8in away), so no ruin is roofed.
    expect(features.some((f) => f.type.includes("roof"))).toBe(false);
    for (const p of L.pieces.filter((q) => q.template === "catwalk")) {
      expect(consumedIds.has(p.id)).toBe(true);
    }
  });
});
