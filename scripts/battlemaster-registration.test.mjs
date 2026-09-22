import { describe, it, expect } from "vitest";
import {
  SIZE_CLASS,
  PART_TO_TEMPLATE,
  PART_CANONICAL,
  normalizeLayout,
} from "./battlemaster-normalize.mjs";
import { footprintPolygon } from "./terrain-resolver.mjs";
import {
  centroid,
  pointInRing,
  pointSegmentDistance,
} from "../src/geometry.ts";
import { placedRing, resolvePlacement } from "../src/placement.ts";
import { loadCorpus } from "./terrain-corpus.mjs";
import { areaBuildingPlacement } from "./area-to-building.mjs";
import { ruinFeaturePlacement } from "./ruin-to-feature.mjs";

const CANVAS = { width: 60, height: 44 };

/**
 * Symmetric Hausdorff distance from each ring's vertices to the other ring's
 * *outline*. Use this for any comparison against upstream's 167-348 vertex
 * traced outlines: vertex-to-vertex, a mid-edge point on the trapezoid is
 * 5.75in from the nearest archetype corner even when the shapes coincide.
 */
const shapeDistance = (a, b) => {
  const toOutline = (ring, other) =>
    Math.max(
      ...ring.map((p) =>
        Math.min(
          ...other.map((_, i) =>
            pointSegmentDistance(p, other[i], other[(i + 1) % other.length]),
          ),
        ),
      ),
    );
  return Math.max(toOutline(a, b), toOutline(b, a));
};

// Read upstream's vocabulary independently of the module under test, since
// these tests check the module's tables still cover it.
/** Upstream's size class, which it puts in the composite's display name. */
const classNameOf = (composite) => composite.name.split(" ")[1];
/** Upstream's part name: the id with its prefix and content hash stripped. */
const partNameOf = (id) =>
  id.replace(/^bm-part-/, "").replace(/-[0-9a-f]{10}$/, "");

const corpus = loadCorpus();
const { templatesById: byId, gwTemplates, footprintOf } = corpus;
const composites = [...byId.values()].filter((t) =>
  String(t.id).startsWith("bm-composite-"),
);
/**
 * A synthetic layout using every composite once at the origin, under one
 * shared pose. Only used composites get fitted, so this puts the whole table
 * through `normalizeLayout`; with no pose, what comes out is the registration
 * alone.
 *
 * A mirrored `pose` is the only thing exercising K's parent-parity factor:
 * every piece upstream ships is rotation-only.
 */
const everyComposite = (pose = {}) => ({
  id: "every-composite",
  pieces: composites.map((t, i) => ({
    id: `area-${i}`,
    piece_type: "area",
    template: t.id,
    position: { x: 0, y: 0 },
    ...pose,
  })),
});
// Raw and normalized layouts both come out of the corpus in source order, so
// `layouts[i]` pairs with `normalized[i]`.
const layouts = corpus.rawLayouts.filter((l) => l.mission_matchup_id);
const normalized = corpus.missionLayouts;

describe("registration tables", () => {
  it("maps every size class and part used by the mission layouts", () => {
    const classes = new Set();
    const parts = new Set();
    for (const layout of layouts) {
      for (const piece of layout.pieces) {
        const composite = byId.get(piece.template);
        classes.add(classNameOf(composite));
        for (const f of composite.features ?? []) parts.add(partNameOf(f.template));
      }
    }
    expect([...classes].sort()).toEqual(Object.keys(SIZE_CLASS).sort());
    expect([...parts].sort()).toEqual(Object.keys(PART_TO_TEMPLATE).sort());
  });

  // `partOf` collapses several drawings of one model onto one row, but
  // `partExtent` reads whichever drawing a feature names, so two drawings can
  // emit two sizes unless one is registered in PART_CANONICAL.
  it("registers a canonical drawing wherever upstream ships a part twice", () => {
    const drawings = {};
    for (const t of byId.values()) {
      if (!String(t.id).startsWith("bm-part-")) continue;
      (drawings[partNameOf(t.id)] ??= []).push(t.id);
    }
    const doubled = Object.entries(drawings)
      .filter(([, ids]) => ids.length > 1)
      .map(([part]) => part);
    expect(doubled.sort()).toEqual(Object.keys(PART_CANONICAL).sort());
    for (const [part, id] of Object.entries(PART_CANONICAL)) {
      expect(drawings[part], `PART_CANONICAL.${part}`).toContain(id);
      // One model: the walls the extent is measured from are identical.
      const walls = JSON.stringify(byId.get(id).walls);
      for (const other of drawings[part]) {
        expect(JSON.stringify(byId.get(other).walls), `${part} ${other}`).toEqual(
          walls,
        );
      }
    }
  });

  it("targets legacy templates that still exist upstream", () => {
    for (const id of Object.values(SIZE_CLASS))
      expect(footprintOf(id), id).toBeDefined();
    for (const [part, v] of Object.entries(PART_TO_TEMPLATE)) {
      if (v.drop) continue;
      expect(footprintOf(v.template), part).toBeDefined();
    }
  });

  it("agrees with upstream's usage counts", () => {
    const classes = {};
    const parts = {};
    for (const layout of layouts) {
      for (const piece of layout.pieces) {
        const composite = byId.get(piece.template);
        const k = classNameOf(composite);
        classes[k] = (classes[k] ?? 0) + 1;
        for (const f of composite.features ?? []) {
          const p = partNameOf(f.template);
          parts[p] = (parts[p] ?? 0) + 1;
        }
      }
    }
    // LongLine and LongLineTower are one archetype under two spellings (see
    // SIZE_CLASS).
    expect(classes).toEqual({
      BigRect: 180,
      LongLine: 78,
      LongLineTower: 12,
      ShortLine: 180,
      SmallRect: 180,
      Triangle: 90,
    });
    // `cd` and `co` are two ids for one model. `ruin-part` is the dropped
    // wall-less fragment.
    expect(parts).toEqual({
      ab: 90,
      cd: 72,
      co: 20,
      corner: 90,
      ef: 86,
      generator: 90,
      gh: 92,
      "long-barrier": 90,
      pipes: 90,
      "ruin-part": 2,
      "short-barrier": 180,
      "small-l": 94,
      "small-l-flip": 176,
      tower: 90,
    });
  });

  // A failed fit throws inside the module, naming the composite. Read the
  // variant each composite registered at back off its emitted area.
  it("accounts for every composite footprint as a registered rigid variant", () => {
    expect(composites).toHaveLength(52);
    const out = normalizeLayout(everyComposite(), byId);
    // Each area carries its V alone, since the piece has no rotation of its own.
    const areas = out.pieces.filter((p) => p.piece_type === "area");
    expect(areas).toHaveLength(composites.length);

    // Name the map each composite registers at, not just that the fit
    // succeeded: a re-traced footprint can fit a *different* rigid map without
    // throwing, and would still move combined.yml.
    const registered = {};
    areas.forEach((area, i) => {
      const cls = classNameOf(composites[i]);
      const V = `${area.rotation_degrees ?? 0}${area.mirror ? `.${area.mirror}` : ""}`;
      registered[cls] = { ...registered[cls] };
      registered[cls][V] = (registered[cls][V] ?? 0) + 1;
    });
    expect(registered).toEqual({
      BigRect: { 180: 25, "180.horizontal": 5 },
      LongLine: { 0: 2 },
      LongLineTower: { "0.horizontal": 1 },
      ShortLine: { 180: 4, "180.horizontal": 2 },
      SmallRect: { 0: 6, "0.horizontal": 3 },
      Triangle: { 270: 1, "90.horizontal": 3 },
    });
  });

  // Each child's composed orientation (V^-1, K, Q), read off the emitted child
  // so no rule of ours is in the expectation. Every composite sits at the
  // origin, so this survives a re-pull re-laying the layouts but fails if K
  // and Q compose in the wrong order or V is applied where its inverse belongs.
  //
  // Pinned at both parent parities: with an unposed parent M is the identity,
  // so dropping M from `P = det(M . Mf)` would pass the unmirrored pass alone.
  const orientations = (layout) => {
    const out = normalizeLayout(layout, byId);
    const children = out.pieces.filter((p) => p.piece_type === "feature");
    expect(children).toHaveLength(96);
    const oriented = {};
    for (const child of children) {
      const A = `${child.rotation_degrees ?? 0}${child.mirror ? `.${child.mirror}` : ""}`;
      oriented[child.template] = { ...oriented[child.template] };
      oriented[child.template][A] = (oriented[child.template][A] ?? 0) + 1;
    }
    return oriented;
  };

  it("composes every child's orientation out of the parent variant, K and Q", () => {
    expect(orientations(everyComposite())).toEqual({
      "barricade": { "0": 4, "0.horizontal": 2 },
      "catwalk": { "180": 1, "180.horizontal": 1 },
      "corner-ruin-balanced-left": { "0": 1, "270": 2, "270.horizontal": 1 },
      "corner-ruin-balanced-right": { "0": 2, "0.horizontal": 1, "180": 3, "180.horizontal": 1, "270": 1, "90": 2 },
      "corner-ruin-left": { "0": 5, "0.horizontal": 2, "180": 4, "270": 4, "270.horizontal": 1, "90": 4 },
      "corner-ruin-right": { "0": 3, "0.horizontal": 1, "180": 2, "270": 4, "270.horizontal": 1, "90": 2 },
      "corner-short": { "0": 2, "0.horizontal": 7, "180": 2, "180.horizontal": 6, "270": 1, "270.horizontal": 2, "90": 2, "90.horizontal": 3 },
      "corner-tiny": { "0": 2, "180.horizontal": 1, "270": 1 },
      "gantry": { "0": 2, "0.horizontal": 1 },
      "generator": { "0": 1, "180": 2, "180.horizontal": 2 },
      "pipe": { "180": 3, "180.horizontal": 1 },
    });
  });

  // Under a mirrored parent every child's own mirror flips against the pass
  // above.
  it("cancels the parent's parity in every child's orientation", () => {
    expect(orientations(everyComposite({ mirror: "horizontal" }))).toEqual({
      "barricade": { "180": 2, "180.horizontal": 4 },
      "catwalk": { "0": 1, "0.horizontal": 1 },
      "corner-ruin-balanced-left": { "180.horizontal": 1, "90": 1, "90.horizontal": 2 },
      "corner-ruin-balanced-right": { "0": 1, "0.horizontal": 2, "180": 1, "180.horizontal": 3, "270.horizontal": 1, "90.horizontal": 2 },
      "corner-ruin-left": { "0": 2, "0.horizontal": 5, "180.horizontal": 4, "270": 1, "270.horizontal": 4, "90.horizontal": 4 },
      "corner-ruin-right": { "0.horizontal": 2, "180": 1, "180.horizontal": 3, "270.horizontal": 2, "90": 1, "90.horizontal": 4 },
      "corner-short": { "0": 6, "0.horizontal": 2, "180": 7, "180.horizontal": 2, "270": 3, "270.horizontal": 2, "90": 2, "90.horizontal": 1 },
      "corner-tiny": { "0.horizontal": 2, "180": 1, "270.horizontal": 1 },
      "gantry": { "180": 1, "180.horizontal": 2 },
      "generator": { "0": 2, "0.horizontal": 2, "180.horizontal": 1 },
      "pipe": { "0": 1, "0.horizontal": 3 },
    });
  });

  // Q is not recoverable from the shipped data: upstream's part footprints are
  // plain rectangles. The values were measured against the pre-pull corpus
  // (see PART_TO_TEMPLATE), so a re-pull must not silently change one.
  //
  // Do not "simplify" this into a bounding-box aspect check: aspect cannot see
  // a half-turn, and for `ab` prefers 90, which the pre-pull corpus rules out
  // (4.25in mean ring mismatch against 1.21in for 180).
  it("registers a measured quarter-turn for every part", () => {
    const turns = Object.fromEntries(
      Object.entries(PART_TO_TEMPLATE)
        .filter(([, v]) => !v.drop)
        .map(([part, v]) => [part, v.turn]),
    );
    expect(turns).toEqual({
      ab: 180,
      cd: 90,
      co: 90,
      corner: 270,
      ef: 90,
      generator: 0,
      gh: 0,
      "long-barrier": 0,
      pipes: 0,
      "short-barrier": 0,
      "small-l": 180,
      "small-l-flip": 180,
      tower: 0,
    });
    // decompose would round-trip an off-axis turn, so nothing else catches it.
    for (const [part, t] of Object.entries(turns)) {
      expect(Number.isInteger(t / 90), `${part} turn ${t} is not a quarter-turn`).toBe(true);
    }
    // An upstreamFootprint part is already in the part's frame.
    for (const [part, v] of Object.entries(PART_TO_TEMPLATE)) {
      if (v.upstreamFootprint) expect(v.turn, part).toBe(0);
    }
  });

});

describe("normalized layouts conform to upstream geometry", () => {
  // Pinned structurally: which parts carry an inline footprint and of which
  // shape (F: upstream's rectangle; Z: the legacy L resized). The sizes
  // themselves are pinned by the committed combined.yml.
  it("draws the upstreamFootprint parts from upstream's own footprint", () => {
    const inlined = Object.entries(PART_TO_TEMPLATE)
      .filter(([, v]) => v.upstreamFootprint)
      .map(([part]) => part);
    expect(inlined).toEqual(["tower", "generator"]);

    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const src = layouts[i];
      for (const child of normalized[i].pieces) {
        if (child.piece_type !== "feature") continue;
        const areaId = child.parent_area_id;
        const composite = byId.get(src.parentOf(areaId).template);
        const feature = composite.features.find(
          (f) => `${areaId}-${f.id}` === child.id,
        );
        const part = partNameOf(feature.template);
        const rule = PART_TO_TEMPLATE[part];
        if (!rule.upstreamFootprint) {
          // Parts under neither F nor Z resolve through their template alone.
          // A Z part must be the 6-vertex L, never upstream's bare rectangle,
          // which would lose the arms ruin-to-feature.mjs reads.
          if (!rule.upstreamSize) {
            expect(child.footprint, `${child.id} (${part})`).toBeUndefined();
            continue;
          }
          expect(
            footprintPolygon(child.footprint).length,
            `${child.id} (${part})`,
          ).toBe(6);
          continue;
        }
        expect(child.footprint.type, `${child.id} (${part})`).toBe("rectangle");
        checked++;
      }
    }
    expect(checked).toBe(180); // the tower + generator counts pinned above
  });

  it("keeps the trapezoid areas on their upstream outline", () => {
    let worst = 0;
    for (let i = 0; i < layouts.length; i++) {
      const src = layouts[i];
      for (const piece of normalized[i].pieces) {
        if (piece.template !== "area-trapezoid") continue;
        const placement = areaBuildingPlacement(
          piece,
          normalized[i],
          gwTemplates,
        );
        // Resolve through placement.ts rather than re-deriving the pin math,
        // so a pivot mistake cannot hide in both converter and check.
        const gw = gwTemplates[placement.type];
        const local = gw.points ?? [
          { x: 0, y: 0 }, { x: gw.width, y: 0 },
          { x: gw.width, y: gw.height }, { x: 0, y: gw.height },
        ];
        const [placed] = resolvePlacement(placement, gwTemplates, CANVAS);
        const drawn = placedRing(local, placed);
        const truth = src.resolve(src.parentOf(piece.id));
        worst = Math.max(worst, shapeDistance(drawn, truth));
      }
    }
    // Upstream's outline is an independent trace of the trapezoid, so a
    // residual remains. The tolerance only has to catch a wrong pivot: the
    // next-best variant of this composite sits 5.2in away.
    expect(worst).toBeLessThan(1.0);
  });

  it("renders each chiral part as exactly one l-ruin variant", () => {
    const seen = {};
    for (const layout of normalized) {
      for (const piece of layout.pieces) {
        if (piece.piece_type !== "feature") continue;
        if (!piece.template.startsWith("corner-")) continue;
        const placement = ruinFeaturePlacement(piece, layout);
        (seen[piece.template] ??= new Set()).add(placement.type);
      }
    }
    // corner-short carries both hands because small-l and small-l-flip are the
    // two hands of one model; every other legacy template takes one part.
    //
    // Upstream's data does not encode chirality, so these hands are measured
    // against the pre-pull corpus (see PART_TO_TEMPLATE) and pinned exactly:
    // `toHaveLength(1)` would pass with every `flip` bit inverted, as would the
    // rest of the suite, so this is the only check that pins a hand.
    expect([...(seen["corner-short"] ?? [])].sort()).toEqual([
      "l-ruin",
      "l-ruin-mirror",
    ]);
    const EXPECTED_HAND = {
      "corner-ruin-balanced-left": ["l-ruin-mirror"],
      "corner-ruin-balanced-right": ["l-ruin-mirror"],
      "corner-ruin-left": ["l-ruin"],
      "corner-ruin-right": ["l-ruin-mirror"],
      "corner-tiny": ["l-ruin-mirror"], // cosmetic: corner-tiny has equal arms
    };
    for (const [template, expected] of Object.entries(EXPECTED_HAND)) {
      expect([...seen[template]].sort(), template).toEqual(expected);
    }
  });
});

// Upstream's composite outline is a trace of the real model that no rule of
// ours takes part in, so it catches a misread anchor that a check composed
// from normalizeLayout's own corrections would agree with. Both sides are
// resolved on the board: the child through its emitted parent, the outline
// through upstream's own area piece.
describe("parts sit inside the composite that contains them", () => {
  // Known structural overhangs, not anchor errors:
  //
  //   `ab` in the two Triangle composites: upstream's own; the pre-pull corpus
  //   overhangs identically.
  //   `pipes`: keeps the legacy `catwalk` polygon (neither F nor Z), which is
  //   half an inch longer than upstream's rectangle.
  //
  // Keyed on upstream's feature id too, since (template, composite) is not
  // unique and a second such part would inherit an allowance never measured
  // for it.
  const KNOWN_OVERHANG = {
    "feature-1 (corner-ruin-balanced-left) in bm-composite-triangle-ab-corner-02-4b8322162e": 2.88,
    "feature-1 (corner-ruin-balanced-left) in bm-composite-triangle-ab-corner-02-8d39f1ed78": 2.88,
    "feature-1 (catwalk) in bm-composite-shortline-pipe-14782bdeaa": 0.51,
    "feature-1 (catwalk) in bm-composite-shortline-pipe-flip-b222534f1a": 0.51,
  };

  it("keeps every emitted part within its composite's traced outline", () => {
    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const src = layouts[i];
      const emitted = normalized[i];
      for (const child of normalized[i].pieces) {
        if (child.piece_type !== "feature") continue;
        const area = src.parentOf(child.parent_area_id);
        const outline = src.resolve(area);
        const ring = emitted.resolve(child);
        const out = Math.max(
          0,
          ...ring
            .filter((p) => !pointInRing(p, outline))
            .map((p) =>
              Math.min(
                ...outline.map((_, k) =>
                  pointSegmentDistance(
                    p,
                    outline[k],
                    outline[(k + 1) % outline.length],
                  ),
                ),
              ),
            ),
        );
        // 0.01in absorbs the hand trace: one part sits 0.0015in proud.
        const key = `${child.name} (${child.template}) in ${area.template}`;
        expect(out, `${normalized[i].id} ${child.id}: ${key}`).toBeLessThan(
          KNOWN_OVERHANG[key] ?? 0.01,
        );
        checked++;
      }
    }
    expect(checked).toBe(1260);
  });
});

describe("board invariants", () => {
  it("keeps every resolved vertex on the 60x44 board", () => {
    for (const layout of normalized) {
      for (const piece of layout.pieces) {
        for (const v of layout.resolve(piece)) {
          expect(v.x, `${layout.id} ${piece.id}`).toBeGreaterThanOrEqual(-0.5);
          expect(v.x, `${layout.id} ${piece.id}`).toBeLessThanOrEqual(60.5);
          expect(v.y, `${layout.id} ${piece.id}`).toBeGreaterThanOrEqual(-0.5);
          expect(v.y, `${layout.id} ${piece.id}`).toBeLessThanOrEqual(44.5);
        }
      }
    }
  });

  // Areas upstream ships off-symmetric on purpose, with their children:
  // `bm-disrupt-vs-disrupt-01`'s central pair sits (-0.25, +0.25)in off its
  // twin pose, a Battlemaster editor nudge upstream preserves
  // (SOURCE_ASYMMETRIC_TWIN_PAIRS in its tools/src/derive-keystones.ts).
  // Mirror that list here; don't widen the bound for it.
  const SOURCE_ASYMMETRIC_AREAS = {
    "bm-disrupt-vs-disrupt-01": ["area-05", "area-11"],
  };

  it("is 180-degree rotationally symmetric about the board centre", () => {
    let worst = 0;
    let worstAt = "";
    for (const layout of normalized) {
      const exempt = SOURCE_ASYMMETRIC_AREAS[layout.id] ?? [];
      const pts = layout.pieces.map((p) => ({
        exempt: exempt.includes(p.parent_area_id ?? p.id),
        kind: p.piece_type,
        c: centroid(layout.resolve(p)),
      }));
      for (const a of pts) {
        if (a.exempt) continue;
        const target = { x: 60 - a.c.x, y: 44 - a.c.y };
        const d = Math.min(
          ...pts
            .filter((b) => b.kind === a.kind)
            .map((b) => Math.hypot(b.c.x - target.x, b.c.y - target.y)),
        );
        if (d > worst) {
          worst = d;
          worstAt = `${layout.id} ${a.kind}`;
        }
      }
    }
    // The residual is 0.0229in on bm-take-vs-recon-03 (the other 44 layouts are
    // exact), so the bound sits just above it: a misplaced piece lands inches
    // out, as the misread mirror anchor did (4.5in). On a failure after a
    // re-pull, diff the layout against upstream first; upstream's own data has
    // carried point-symmetry slips.
    expect(worst, worstAt).toBeLessThan(0.05);
  });
});
