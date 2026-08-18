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

// Smallest distance between two closed rings (0 when their edges cross), plus a
// point-in-ring test, so the roofing guard below can ask whether a catwalk and a
// ruin actually share ground rather than comparing centroids.
function ringGap(a, b) {
  const segGap = (p, q, r, s) => {
    const near = (u, v, w) => {
      const vx = v.x - u.x;
      const vy = v.y - u.y;
      const len = vx * vx + vy * vy;
      const t = len
        ? Math.max(0, Math.min(1, ((w.x - u.x) * vx + (w.y - u.y) * vy) / len))
        : 0;
      return Math.hypot(u.x + t * vx - w.x, u.y + t * vy - w.y);
    };
    return Math.min(near(p, q, r), near(p, q, s), near(r, s, p), near(r, s, q));
  };
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      min = Math.min(
        min,
        segGap(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]),
      );
    }
  }
  return min;
}

const inRing = (p, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (
      ring[i].y > p.y !== ring[j].y > p.y &&
      p.x <
        ((ring[j].x - ring[i].x) * (p.y - ring[i].y)) / (ring[j].y - ring[i].y) +
          ring[i].x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

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
      const pl = ruinFeaturePlacement(piece, lookupFootprint, getParent);
      const target = resolvePiece(piece, lookupFootprint, getParent);
      expect(ringMismatch(featureFootprint(pl), target)).toBeLessThan(0.02);
    });
  }

  it("picks the mirror variant for opposite-chirality templates", () => {
    const right = sample["corner-ruin-right"];
    const pl = ruinFeaturePlacement(right.piece, lookupFootprint, right.getParent);
    expect(pl.type).toBe("l-ruin-mirror");
    const left = sample["corner-ruin-left"];
    expect(
      ruinFeaturePlacement(left.piece, lookupFootprint, left.getParent).type,
    ).toBe("l-ruin");
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
      expect(["l-ruin", "l-ruin-mirror"]).toContain(f.type);
    }
  });

  it("emits no -roof variant, because no catwalk rests on a ruin", () => {
    // The corpus has no catwalk-on-ruin relation to read, in the data or in the
    // geometry, so the converter emits plain l-ruin everywhere. (`l-ruin-roof`
    // is still a live feature type - gw.yml hand-authors one.)
    //
    // Upstream ships `pipes` as its own standalone composite - composite-03 and
    // composite-30, each with the pipes part as its only child - so a catwalk is
    // never a sibling of a ruin part, and the assertions below re-derive that
    // from the shipped geometry every run.
    //
    // Catwalk-to-nearest-ruin polygon gaps over all 90, sorted:
    //
    //   0.002 x2  0.005 x4 | 0.435 x2  0.461 x2  0.498 x12  0.502 x10 .. 6.98
    //
    // Nothing at zero, no second ring within reach of any catwalk, and the six
    // that come closest to touching are *not* the ones a centroid threshold
    // picks: they sit 3.996-5.037in centre-to-centre, past every catwalk in the
    // 0.5in-gap population. That is what retired `ROOF_DISTANCE = 3.21`, which
    // roofed 20 of the 0.5in ones and skipped all six of these. The guard here
    // is deliberately about contact, not about a count: if a future pull ever
    // does seat a catwalk on a ruin, these fail and the -roof variant is worth
    // reviving.
    const missions = layouts.filter((l) => l.mission_matchup_id);
    const catwalks = missions
      .flatMap((l) => l.pieces)
      .filter((p) => p.template === "catwalk");
    expect(catwalks.length).toBe(90);
    const features = missions.flatMap(
      (l) => ruinFeatures(l, lookupFootprint, getParentFor(l)).features,
    );
    expect(features.length).toBe(720);
    expect(features.filter((f) => f.type.includes("roof")).length).toBe(0);

    let touching = 0;
    let siblings = 0;
    let minGap = Infinity;
    for (const L of missions) {
      const getParent = getParentFor(L);
      const ruins = L.pieces
        .filter(
          (p) =>
            isRuinTemplate(p.template) &&
            isLFootprint(p.footprint ?? lookupFootprint(p.template)),
        )
        .map((p) => ({ p, ring: resolvePiece(p, lookupFootprint, getParent) }));
      for (const p of L.pieces.filter((q) => q.template === "catwalk")) {
        const ring = resolvePiece(p, lookupFootprint, getParent);
        for (const r of ruins) {
          const gap = ringGap(ring, r.ring);
          minGap = Math.min(minGap, gap);
          if (
            ring.some((q) => inRing(q, r.ring)) ||
            r.ring.some((q) => inRing(q, ring))
          ) {
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
    // Upstream filled the two variants that used to be short (12 each), so the
    // corpus is now uniform - this is what retires the gw.yml patch overlay.
    for (const L of layouts.filter((l) => l.mission_matchup_id)) {
      const { features } = ruinFeatures(L, lookupFootprint, getParentFor(L));
      expect(features.length, L.id).toBe(16);
    }
  });
});
