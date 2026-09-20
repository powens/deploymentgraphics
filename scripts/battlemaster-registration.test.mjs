import { describe, it, expect } from "vitest";
import {
  SIZE_CLASS,
  PART_TO_TEMPLATE,
  PART_CANONICAL,
  normalizeLayout,
} from "./battlemaster-normalize.mjs";
import { resolvePiece, footprintPolygon } from "./terrain-resolver.mjs";
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
 * Shape distance between two rings: the Hausdorff distance from each ring's
 * vertices to the *other ring's outline*, rather than to its vertices.
 *
 * `ringMismatch` compares vertex sets, which the battlemaster-11e re-source made
 * useless for comparing an area against upstream: upstream now ships each
 * composite as a 167-348 vertex traced outline where it used to ship a copy of
 * one of the five 20-28 vertex legacy archetypes. Vertex-to-vertex, a point
 * halfway along the trapezoid's long edge is 5.75in from the nearest archetype
 * corner even when the two shapes coincide exactly, so `ringMismatch` measures
 * how densely each ring is sampled and not whether they are the same shape.
 * Every comparison against upstream's traced outline uses this instead.
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

// How upstream spells a size class and a part name. Read here rather than
// imported: these tests are about whether the registration tables still cover
// what upstream ships, so they have to read upstream's own vocabulary
// independently of the module that maps it.
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
 * A synthetic layout using every composite once, each at the origin, under one
 * shared pose.
 *
 * Only the composites a layout actually uses get fitted, so this is what puts
 * the whole table through `normalizeLayout`. Called with no pose, each piece
 * carries none of its own, so what comes out is the registration alone - the
 * area's variant and each child's composed correction - rather than how a
 * mission lays it out.
 *
 * `pose` is for the one correction that is invisible without it: K cancels the
 * *parent's* parity, and no mission layout supplies one (every piece upstream
 * ships is rotation-only, det +1 - the re-source replaced the piece-level
 * `mirror` flag with separate mirrored composite templates). So a mirrored pose
 * here is what exercises that factor at all.
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
// This suite is the one place that reads both frames: it checks the normalized
// layouts against the upstream ones they were derived from, so it takes the
// raw layouts alongside `missionLayouts`. Both come out of the corpus in
// source order, which is what lets `layouts[i]` and `normalized[i]` pair up.
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

  // The re-source content-hashes every template id, so one model can arrive as
  // several drawings and `partOf` deliberately collapses them onto one legacy
  // row. `partExtent` does not collapse with it: it reads whichever drawing the
  // feature names, so two drawings of one model silently emit two sizes unless
  // one of them is registered. Two ids reached `ab` in this pull and 2 of its 90
  // ruins came out a quarter-inch wide before PART_CANONICAL. Fail on the next
  // one rather than on its geometry.
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
      // What makes them one model rather than two: the walls the extent is
      // measured from are identical, and only the roof was redrawn.
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
      // A dropped part maps onto nothing by design; everything else must name a
      // legacy template that upstream still ships.
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
    // LongLine and LongLineTower are one archetype under two upstream spellings
    // (see SIZE_CLASS); together they are the 90 the pre-re-source LL was.
    expect(classes).toEqual({
      BigRect: 180,
      LongLine: 78,
      LongLineTower: 12,
      ShortLine: 180,
      SmallRect: 180,
      Triangle: 90,
    });
    // `cd` and `co` are two upstream ids for one identical model, and together
    // they are exactly the 92 that `co` alone was before the re-source.
    // `ruin-part` is the wall-less fragment this module drops.
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

  // The fit that registers each composite's rigid variant lives in the module
  // now, where a failed fit throws and names the composite instead of surfacing
  // here as a wall of assertions. It throws when a composite's footprint is a
  // shape upstream has not shipped before, or when the reference composite its
  // class is pinned against has gone.
  //
  // Only the composites a layout actually uses get fitted, so hand
  // `normalizeLayout` one that uses all of them - and read the variant it
  // registered each at back off the emitted area, which is the only place the
  // fit is visible from outside the module now.
  it("accounts for every composite footprint as a registered rigid variant", () => {
    expect(composites).toHaveLength(52);
    const out = normalizeLayout(everyComposite(), byId);
    // One area out per composite in, in source order: each carries its V alone,
    // since the piece went in at the origin with no rotation of its own.
    const areas = out.pieces.filter((p) => p.piece_type === "area");
    expect(areas).toHaveLength(composites.length);

    // Characterization of the fit's output: which rigid map each class's
    // composites come out registered at, and how many at each.
    //
    // "It did not throw" is not the guard this is here to be, and neither is a
    // count of how many landed away from the identity: upstream re-tracing a
    // footprint onto a *different* rigid map still fits, still does not throw,
    // and still leaves any such count where it was - while moving
    // combined.yml. Naming the maps is what notices.
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

  // The child's orientation, pinned through the same synthetic layout.
  //
  // `normalizeLayout` composes each child's A out of the parent's inverted
  // variant, the chirality correction K and the per-part quarter-turn Q. The
  // tests that used to check that composition rebuilt it from the same rule and
  // compared it to itself, so they could not tell a wrong reading from a right
  // one; they are gone. This reads the composed orientation off the emitted
  // child instead, which is where it matters and where no rule of ours takes
  // part.
  //
  // Every composite goes in at the origin, so what comes out is the correction
  // alone - not how a mission happens to lay the composite out. That is what
  // makes this survive a re-pull that re-lays the 45 layouts and still fail if
  // K and Q compose in the wrong order, or if V is applied where its inverse
  // belongs.
  //
  // It is pinned at both parent parities, because the unmirrored pass alone
  // cannot see half of K. With an unposed parent M is the identity, so
  // `P = det(M . Mf)` collapses to `det(Mf)` and the parent factor is exercised
  // by nothing: mutating the module to drop M outright leaves this whole file
  // green. No mission layout supplies the missing parity either - every piece
  // upstream ships is rotation-only - so the mirrored pass below is the only
  // thing standing between that factor and a silent deletion.
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

  // The same 96 children under a mirrored parent. K has to cancel that parity,
  // so every child's own mirror flips against the pass above while its
  // quarter-turn is preserved - which is what makes this the pass that fails
  // when the parent factor goes missing.
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
  // plain rectangles, so nothing in terrain-templates.json records which way
  // round the model is drawn. The values were measured against the pre-pull
  // corpus (see PART_TO_TEMPLATE) and are pinned here for the same reason
  // EXPECTED_HAND is - a re-pull must not silently turn a building.
  //
  // Do not "simplify" this into a bounding-box aspect check. Aspect cannot see a
  // half-turn, three of these are half-turns, and for `ab` the aspect ratio
  // prefers 90 - the answer the pre-pull corpus rules out at 4.25in mean ring
  // mismatch against 1.21in for 180.
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
    // A turn that is not a multiple of 90 would take the legacy polygon off the
    // board's axes; decompose would still round-trip it, so nothing else catches it.
    for (const [part, t] of Object.entries(turns)) {
      expect(Number.isInteger(t / 90), `${part} turn ${t} is not a quarter-turn`).toBe(true);
    }
    // A part drawn from upstream's own footprint is already in the upstream
    // part's frame, so a non-zero turn there would be turning it away from the
    // truth rather than onto it.
    for (const [part, v] of Object.entries(PART_TO_TEMPLATE)) {
      if (v.upstreamFootprint) expect(v.turn, part).toBe(0);
    }
  });

});

describe("normalized layouts conform to upstream geometry", () => {
  // Every part takes its size from upstream; they differ in how much of the
  // legacy polygon survives with it.
  //
  //   F - where the legacy footprint is itself a plain rectangle it carries no
  //       shape upstream's lacks, only a size, and the sizes disagree
  //       (generator 3x4 against 4.5x2, tower 2x2 against 2x2.5). Those parts
  //       take upstream's rectangle whole, reproducing its outline exactly
  //       rather than to within the ~0.2in a stand-in could manage.
  //   Z - the `corner-*` parts keep their L, resized onto upstream's rectangle.
  //
  // Pinned structurally: which parts carry an inline footprint at all, and
  // which shape it is. The sizes are not re-derived here - re-measuring
  // upstream's extent would be a transcription of `partExtent`, and the
  // committed combined.yml pins every emitted footprint exactly.
  it("draws the upstreamFootprint parts from upstream's own footprint", () => {
    const inlined = Object.entries(PART_TO_TEMPLATE)
      .filter(([, v]) => v.upstreamFootprint)
      .map(([part]) => part);
    expect(inlined).toEqual(["tower", "generator"]);

    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const srcParent = layouts[i].parentOf;
      for (const child of normalized[i].pieces) {
        if (child.piece_type !== "feature") continue;
        const areaId = child.parent_area_id;
        const composite = byId.get(srcParent(areaId).template);
        const feature = composite.features.find(
          (f) => `${areaId}-${f.id}` === child.id,
        );
        const part = partNameOf(feature.template);
        const rule = PART_TO_TEMPLATE[part];
        if (!rule.upstreamFootprint) {
          // Only the three parts under neither F nor Z resolve through their
          // template alone; everything else carries an inline footprint, and
          // a `corner-*` one has to be the legacy L resized onto upstream's
          // rectangle (Z), never upstream's bare rectangle - that would throw
          // away the L shape ruin-to-feature.mjs reads its arms from.
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
        // An F part takes upstream's own rectangle whole.
        expect(child.footprint.type, `${child.id} (${part})`).toBe("rectangle");
        checked++;
      }
    }
    expect(checked).toBe(180); // the tower + generator counts pinned above
  });

  it("keeps the trapezoid areas on their upstream outline", () => {
    let worst = 0;
    for (let i = 0; i < layouts.length; i++) {
      const srcParent = layouts[i].parentOf;
      for (const piece of normalized[i].pieces) {
        if (piece.template !== "area-trapezoid") continue;
        const placement = areaBuildingPlacement(
          piece,
          footprintOf(piece.template),
          gwTemplates,
        );
        // Rebuild the rendered outline by crossing the placement seam: resolve
        // the corner-pin placement to a `Placed`, then draw the template's own
        // ring through it. Re-deriving the pin math here would let the same
        // pivot mistake hide in both the converter and its check.
        const gw = gwTemplates[placement.type];
        const local = gw.points ?? [
          { x: 0, y: 0 }, { x: gw.width, y: 0 },
          { x: gw.width, y: gw.height }, { x: 0, y: gw.height },
        ];
        const [placed] = resolvePlacement(placement, gwTemplates, CANVAS);
        const drawn = placedRing(local, placed);
        const truth = resolvePiece(
          srcParent(piece.id),
          footprintOf,
          srcParent,
        );
        worst = Math.max(worst, shapeDistance(drawn, truth));
      }
    }
    // This used to pin the drawn trapezoid onto upstream's outline to 0.01in,
    // because upstream's outline *was* the archetype. It is now an independently
    // traced 348-vertex polygon of the same trapezoid, so the two agree in shape
    // but not vertex for vertex, and the residual is the tracing difference
    // rather than a placement error. What the tolerance still has to catch is a
    // wrong pivot, which is a whole-piece displacement: the next-best variant of
    // this composite sits 5.2in away, and the gap between the two is the margin
    // this is protecting.
    expect(worst).toBeLessThan(1.0);
  });

  it("renders each chiral part as exactly one l-ruin variant", () => {
    const seen = {};
    for (const layout of normalized) {
      const getParent = layout.parentOf;
      for (const piece of layout.pieces) {
        if (piece.piece_type !== "feature") continue;
        if (!piece.template.startsWith("corner-")) continue;
        const placement = ruinFeaturePlacement(
          piece,
          footprintOf,
          getParent,
          false,
        );
        (seen[piece.template] ??= new Set()).add(placement.type);
      }
    }
    // corner-short carries both hands because small-l and small-l-flip are the
    // two hands of one model; every other legacy template takes a single part.
    //
    // Upstream's data still does not encode the chirality this table pins:
    // a part is drawn as a rectangle plus an unhanded wall polyline, and the one
    // composite feature that does carry a `mirror` is a generator, which has no
    // hand to speak of. So this table is a reconstruction, not a re-read of
    // upstream. It
    // is pinned here rather than left as `toHaveLength(1)` because a
    // `toHaveLength(1)` assertion is symmetric under inverting every `flip`
    // bit in PART_TO_TEMPLATE — that inversion was verified to pass the
    // entire rest of the suite (registration counts, child conformance, board
    // invariants) unchanged, so this is the only automated check that pins a
    // hand at all. The values below are measured from the shipped code:
    // `small-l`/`small-l-flip` (-> corner-short) rest on decisive evidence
    // (180/180 tight positional matches against the pre-pull corpus); the
    // `ab`/`ef`/`co`/`gh` bits (-> corner-ruin-balanced-left/-right,
    // corner-ruin-left/-right) rest on the Task 6 visual spot-check only. A
    // future re-pull must not silently flip a hand here.
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

// Upstream's own composite outline is the one frame in this file that no rule
// of ours takes part in: it is a 167-348 vertex trace of the real model,
// shipped alongside the parts it contains. So it is the check that catches a
// misread anchor, and the reason the checks that re-derived one have gone -
// they composed their expectation out of the same corrections `normalizeLayout`
// applies, and would have agreed with a wrong one.
//
// It has already earned that: the mirrored generator hung 3.7in out of its own
// parent before the anchor fix, with the whole suite green.
//
// Both sides are resolved on the board rather than in the composite's own
// frame - the emitted child through its emitted parent, upstream's outline
// through upstream's own area piece - so nothing here reaches inside the module.
describe("parts sit inside the composite that contains them", () => {
  // Four (part, composite) pairs sit outside, and both reasons are structural
  // rather than anchor errors.
  //
  // `ab` hangs out of the two Triangle composites it sits in; that is upstream's
  // own - bm-recon-vs-assets-01 reproduces the pre-pull corpus exactly there, so
  // the port is carrying the overhang across rather than causing it.
  //
  // `pipes` is one of the three parts under neither F nor Z, so its emitted
  // piece keeps the legacy `catwalk` polygon whole; that polygon is drawn half
  // an inch longer than upstream's own rectangle, and the overhang is exactly
  // that difference.
  //
  // Keyed on upstream's own feature id as well as the template, so an allowance
  // covers the one part it was measured against. `(template, composite)` alone
  // is not unique - 360 of the 1260 checks share such a key with a sibling
  // under the same area - so a re-pull adding a second
  // `corner-ruin-balanced-left` to a Triangle composite would inherit a free
  // 2.88in pass it was never measured for.
  const KNOWN_OVERHANG = {
    "feature-1 (corner-ruin-balanced-left) in bm-composite-triangle-ab-corner-02-4b8322162e": 2.88,
    "feature-1 (corner-ruin-balanced-left) in bm-composite-triangle-ab-corner-02-8d39f1ed78": 2.88,
    "feature-1 (catwalk) in bm-composite-shortline-pipe-14782bdeaa": 0.51,
    "feature-1 (catwalk) in bm-composite-shortline-pipe-flip-b222534f1a": 0.51,
  };

  it("keeps every emitted part within its composite's traced outline", () => {
    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const srcParent = layouts[i].parentOf;
      const outParent = normalized[i].parentOf;
      for (const child of normalized[i].pieces) {
        if (child.piece_type !== "feature") continue;
        const area = srcParent(child.parent_area_id);
        const outline = resolvePiece(area, footprintOf, srcParent);
        const ring = resolvePiece(child, footprintOf, outParent);
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
        // 0.01in absorbs the trace: one part sits 0.0015in proud of an outline
        // drawn round it by hand. Everything unlisted is exactly inside.
        const key = `${child.name} (${child.template}) in ${area.template}`;
        expect(out, `${normalized[i].id} ${child.id}: ${key}`).toBeLessThan(
          KNOWN_OVERHANG[key] ?? 0.01,
        );
        checked++;
      }
    }
    // The part totals pinned by "agrees with upstream's usage counts" above.
    expect(checked).toBe(1260);
  });
});

describe("board invariants", () => {
  it("keeps every resolved vertex on the 60x44 board", () => {
    for (const layout of normalized) {
      const getParent = layout.parentOf;
      for (const piece of layout.pieces) {
        for (const v of resolvePiece(piece, footprintOf, getParent)) {
          expect(v.x, `${layout.id} ${piece.id}`).toBeGreaterThanOrEqual(-0.5);
          expect(v.x, `${layout.id} ${piece.id}`).toBeLessThanOrEqual(60.5);
          expect(v.y, `${layout.id} ${piece.id}`).toBeGreaterThanOrEqual(-0.5);
          expect(v.y, `${layout.id} ${piece.id}`).toBeLessThanOrEqual(44.5);
        }
      }
    }
  });

  // Areas upstream deliberately ships off-symmetric, with their children. Both
  // pieces of `bm-disrupt-vs-disrupt-01`'s central pair sit (-0.25, +0.25)in
  // off their twin pose - 0.707in apart - and upstream registers the pair as a
  // Battlemaster editor nudge it preserves on purpose
  // (SOURCE_ASYMMETRIC_TWIN_PAIRS in its tools/src/derive-keystones.ts, since
  // 40kdc-data 39661875). Mirror that list here; don't widen the bound for it.
  const SOURCE_ASYMMETRIC_AREAS = {
    "bm-disrupt-vs-disrupt-01": ["area-05", "area-11"],
  };

  it("is 180-degree rotationally symmetric about the board centre", () => {
    let worst = 0;
    let worstAt = "";
    for (const layout of normalized) {
      const getParent = layout.parentOf;
      const exempt = SOURCE_ASYMMETRIC_AREAS[layout.id] ?? [];
      const pts = layout.pieces.map((p) => ({
        exempt: exempt.includes(p.parent_area_id ?? p.id),
        kind: p.piece_type,
        c: centroid(resolvePiece(p, footprintOf, getParent)),
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
    // 0.0229in, on bm-take-vs-recon-03, and 44 of the 45 layouts are exactly
    // symmetric. This bound is the one board-level check that a piece has moved
    // and nothing else noticed, so it is set just clear of that residual rather
    // than at a round number: the misread mirror anchor this suite missed once
    // put two generators 4.5in out, and every candidate for the next such bug is
    // similarly far above the noise. If a re-pull lands a failure here, diff the
    // named layout against upstream before assuming the port regressed -
    // upstream's own data has carried point-symmetry slips before.
    expect(worst, worstAt).toBeLessThan(0.05);
  });
});
