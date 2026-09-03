import { describe, it, expect } from "vitest";
import {
  SIZE_CLASS,
  PART_TO_TEMPLATE,
  VARIANT,
  isCompositeTemplate,
  classOf,
  partOf,
  decompose,
  pieceMatrix,
  bboxSize,
  partExtent,
  partAnchorShift,
  mirrorAnchorFix,
  PART_CANONICAL,
  canonicalPartId,
  orthoInverse,
} from "./battlemaster-normalize.mjs";
import { resolvePiece, footprintPolygon } from "./terrain-resolver.mjs";
import {
  FLIP_X,
  FLIP_Y,
  IDENTITY,
  boundsCentre as bboxCentre,
  centroid,
  det,
  matmul,
  matvec,
  pointInRing,
  pointSegmentDistance,
  ringMismatch,
  rotationMatrix as rotation,
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
 * Every comparison here that crosses that seam uses this instead; comparisons
 * between two rings drawn from the same footprint still use `ringMismatch`,
 * which is exact.
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

/** A ring translated so its area centroid sits on the origin. */
const centred = (ring) => {
  const c = centroid(ring);
  return ring.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
};

/**
 * Upstream's own placement of one composite part, as a piece: the part's model
 * extent, anchored where upstream anchors it.
 *
 * Upstream's `position` names the centre of the part's *roof* since the
 * re-source, while the piece this module emits is the size of the whole model,
 * so the two only line up after `partAnchorShift`. Both this and the emitted
 * child therefore describe the same rectangle, which is what lets the
 * assertions below compare them directly.
 *
 * This reads `position` through the same two corrections the module does, so on
 * its own it cannot tell a wrong reading from a right one - both sides would
 * move together. `parts sit inside the composite that contains them` below is the
 * check that does not share that blind spot: it measures the part against
 * upstream's own traced polygon, which no anchor rule of ours takes part in.
 */
const upstreamPart = (feature, part, areaId) => {
  const Mf = pieceMatrix(feature);
  const shift = matvec(Mf, partAnchorShift(part));
  const fix = mirrorAnchorFix(part, feature);
  return {
    id: "truth",
    footprint: partExtent(part),
    position: {
      x: feature.position.x + fix.x + shift.x,
      y: feature.position.y + fix.y + shift.y,
    },
    rotation_degrees: feature.rotation_degrees ?? 0,
    ...(feature.mirror ? { mirror: feature.mirror } : {}),
    parent_area_id: areaId,
  };
};

/** The eight rigid maps a composite footprint can sit under, by name. */
const CANDIDATES = Object.fromEntries(
  [0, 90, 180, 270].flatMap((d) => [
    [`R${d}`, rotation(d)],
    [`R${d}.FX`, matmul(rotation(d), FLIP_X)],
  ]),
);

/** Name one of CANDIDATES from its matrix. */
const nameOfVariant = (V) =>
  Object.entries(CANDIDATES).find(([, M]) =>
    M.every((row, i) => row.every((x, j) => Math.abs(x - V[i][j]) < 1e-9)),
  )?.[0];

/**
 * Each size class's reference composite - lowest id in the class - and the
 * orientation it is registered at. The absolute half of the rigid-variant check
 * below; see the comment there for why it is pinned rather than derived.
 */
const CLASS_REFERENCE = {
  BigRect: ["bm-composite-bigrect-cd-ef-01-19f1adc57b", "R180"],
  LongLine: ["bm-composite-longline-tower-3be6fa3536", "R0"],
  LongLineTower: ["bm-composite-longlinetower-flip-06c4f02941", "R0.FX"],
  ShortLine: ["bm-composite-shortline-barrier-348db27c93", "R180"],
  SmallRect: ["bm-composite-smallrect-generator-44c45681fa", "R0"],
  Triangle: ["bm-composite-triangle-ab-corner-02-4b8322162e", "R90.FX"],
};

const corpus = loadCorpus();
const { templatesById: byId, gwTemplates, footprintOf } = corpus;
/** The drawing a feature's model is read from, through PART_CANONICAL. */
const upstreamPartOf = (feature) => byId.get(canonicalPartId(feature.template));
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
        classes.add(classOf(composite));
        for (const f of composite.features ?? []) parts.add(partOf(f.template));
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
      (drawings[partOf(t.id)] ??= []).push(t.id);
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
        const k = classOf(composite);
        classes[k] = (classes[k] ?? 0) + 1;
        for (const f of composite.features ?? []) {
          const p = partOf(f.template);
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

  // The guard that stops a new upstream rigid variant from silently rendering
  // ~6in out of place.
  //
  // It used to read: every composite footprint is its archetype's polygon under
  // the registered V, vertex for vertex. The re-source killed that premise -
  // composites are individually traced outlines now, and no rigid map takes the
  // coarse archetype onto one exactly. What survives, and is just as tight, is
  // that the composites *of a class* are still rigid transforms of each other:
  // 52 composites share 13 distinct footprints, and within a class any two of
  // them coincide to 0.0000in under one of the eight rigid maps (against 0.21in
  // or more for every other map). So each class gets a reference footprint, and
  // every other composite in it must be that reference under a rigid W, with its
  // registered V equal to W composed onto the reference's.
  //
  // A composite whose footprint is a shape upstream has not shipped before fails
  // the first assertion; one that is a known shape at an unregistered
  // orientation fails the second.
  it("accounts for every composite footprint as a registered rigid variant", () => {
    const composites = [...byId.values()].filter((t) => isCompositeTemplate(t.id));
    const byClass = {};
    for (const c of composites) (byClass[classOf(c)] ??= []).push(c);

    for (const [cls, members] of Object.entries(byClass)) {
      // Sorted, not source order: the reference is half of what CLASS_REFERENCE
      // pins, so it cannot be allowed to move when upstream reorders the file.
      members.sort((a, b) => (a.id < b.id ? -1 : 1));
      const ref = members[0];
      const refRing = centred(footprintPolygon(ref.footprint));
      const refV = VARIANT[ref.id] ?? IDENTITY;
      // The check below is relative: it fixes every composite in a class against
      // that class's reference, and says nothing at all about the reference
      // itself. On its own that leaves a whole class free to be registered a
      // quarter-turn or a reflection out with every assertion still green - and
      // for LongLineTower, whose single composite is its own reference, it
      // degenerates to `V === V`. So the references are pinned outright.
      //
      // The pin is a characterization, and it has to be: V is derived by vote
      // against the pre-pull corpus (see VARIANT), which no longer exists to
      // re-derive it from inside a test, and fitting the coarse archetype to
      // upstream's re-traced outline is not a substitute - it prefers the other
      // reflection for three of these six classes (see VARIANT's header). What
      // it buys is that re-registering a class stops being invisible: it fails
      // here instead of moving combined.yml in silence. That is the same job
      // EXPECTED_HAND does below.
      const [refId, refName] = CLASS_REFERENCE[cls] ?? [];
      expect(ref.id, `${cls} reference`).toEqual(refId);
      expect(nameOfVariant(refV), `${cls} reference orientation`).toEqual(refName);
      for (const c of members) {
        const ring = centred(footprintPolygon(c.footprint));
        const fits = Object.entries(CANDIDATES)
          .map(([n, W]) => [
            shapeDistance(refRing.map((p) => matvec(W, p)), ring),
            n,
            W,
          ])
          .sort((a, b) => a[0] - b[0]);
        const [best, , W] = fits[0];
        expect(
          best,
          `${c.id} is not a rigid transform of the ${cls} reference ${ref.id}`,
        ).toBeLessThan(1e-3);
        const want = matmul(W, refV).map((r) => r.map((x) => Math.round(x) + 0));
        const got = (VARIANT[c.id] ?? IDENTITY).map((r) =>
          r.map((x) => Math.round(x) + 0),
        );
        expect(got, `${c.id} is registered at the wrong orientation`).toEqual(want);
      }
    }
  });

  // `normalizeLayout` emits each child at `matvec(V, position)` while its parent
  // area now carries `M·V`, so the child resolves through V twice. That is only
  // the identity when V is its own inverse. Both registered variants are
  // (a reflection and a 180-degree rotation), but the assumption is load-bearing
  // enough to pin: a future 90-degree variant would silently misplace children.
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

  // This used to require every variant to be its own inverse, because
  // normalizeLayout undid the parent's V by applying V again. The re-source
  // registered one that is not - Triangle#12 is a reflection composed onto a
  // reflection, which lands on R270 - so the module takes a real inverse and
  // what has to hold is only that the inverse exists, i.e. that V is orthogonal.
  // A non-orthogonal V would scale or shear the area and silently misplace every
  // child hanging off it.
  it("registers only orthogonal variants, and inverts them exactly", () => {
    for (const [id, V] of Object.entries(VARIANT)) {
      // +0 canonicalizes IEEE-754 -0 (e.g. (-1)*0) to 0 before the deep-equal,
      // which otherwise distinguishes signed zero even though -0 === 0.
      const round = (M) => M.map((row) => row.map((x) => x + 0));
      expect(round(matmul(V, orthoInverse(V))), `${id} does not invert`).toEqual(
        IDENTITY,
      );
      expect(Math.abs(det(V)), `${id} is not a rigid map`).toBeCloseTo(1, 12);
    }
    // ...and the one that made this necessary is still here, so a future
    // simplification back to `matvec(V, ...)` cannot pass unnoticed.
    const notSelfInverse = Object.entries(VARIANT).filter(
      ([, V]) =>
        JSON.stringify(matmul(V, V).map((r) => r.map((x) => x + 0))) !==
        JSON.stringify(IDENTITY),
    );
    expect(notSelfInverse.map(([id]) => id)).toEqual([
      "bm-composite-triangle-ab-corner-flip-e300f1fbc2",
    ]);
  });
});

describe("decompose", () => {
  it("round-trips a pure rotation", () => {
    expect(decompose(rotation(90))).toEqual({ rotation_degrees: 90 });
    expect(decompose(rotation(0))).toEqual({ rotation_degrees: 0 });
  });

  it("splits an improper map into mirror-then-rotate", () => {
    // resolvePiece applies mirror first, then rotation: A = R(theta) . S.
    const A = matmul(rotation(30), FLIP_X);
    expect(decompose(A)).toEqual({
      rotation_degrees: 30,
      mirror: "horizontal",
    });
  });

  it("expresses a vertical flip as mirror-plus-180", () => {
    expect(decompose(FLIP_Y)).toEqual({
      rotation_degrees: 180,
      mirror: "horizontal",
    });
  });
});

describe("normalized layouts conform to upstream geometry", () => {
  // The check that pins S. Upstream's `position` anchors the part's *rectangle*
  // centre, which for a rectangle is also its area centroid - the point
  // resolvePiece anchors on. The legacy `corner-*` polygons are L-shaped, so
  // their centroid sits up to (1, 1)in inside their bbox centre, and carrying
  // `position` across unchanged would land every L-shaped part that far out.
  //
  // So compare anchor points, not rings: the two footprints are different
  // polygons of different sizes, but the emitted piece's bbox centre must land
  // exactly where upstream's rectangle centre does. Resolving both rings and
  // comparing them (the obvious formulation) cannot work here and, worse,
  // resolving the *same* upstream footprint under both frames - which is what
  // this test used to do - silently drops the substituted polygon from the
  // comparison altogether, which is why it passed while every ruin sat ~1in off.
  it("anchors every child on the upstream part's extent centre", () => {
    let worst = 0;
    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const src = layouts[i];
      const out = normalized[i];
      const srcParent = src.parentOf;
      const outParent = out.parentOf;
      for (const child of out.pieces) {
        if (child.piece_type !== "feature") continue;
        const areaId = child.parent_area_id;
        const composite = byId.get(srcParent(areaId).template);
        const feature = composite.features.find(
          (f) => `${areaId}-${f.id}` === child.id,
        );
        // Where upstream puts the part's model centre. `partExtent` is a
        // rectangle, so its resolved centroid is its resolved bbox centre.
        //
        // This used to resolve upstream's `footprint` at upstream's `position`
        // directly. Since the re-source that pair names the *roof*, which for
        // the five big L-ruins sits up to (1.25, 1.5)in off the model's centre -
        // so reading it directly would now pin every one of them to the wrong
        // point, and pin the emitted piece to it too.
        const want = centroid(
          resolvePiece(
            upstreamPart(feature, upstreamPartOf(feature), areaId),
            footprintOf,
            srcParent,
          ),
        );
        // Where the emitted piece puts its own polygon's bbox centre. The
        // resolved ring's centroid is the image of the footprint's centroid, so
        // step from there to the bbox centre through the piece's own map.
        // `child.footprint` first, for the parts that carry upstream's own
        // rectangle instead of a legacy stand-in.
        const ring = footprintPolygon(
          child.footprint ?? footprintOf(child.template),
        );
        const T = matmul(pieceMatrix(outParent(areaId)), pieceMatrix(child));
        const d = {
          x: bboxCentre(ring).x - centroid(ring).x,
          y: bboxCentre(ring).y - centroid(ring).y,
        };
        const c = centroid(resolvePiece(child, footprintOf, outParent));
        const got = {
          x: c.x + T[0][0] * d.x + T[0][1] * d.y,
          y: c.y + T[1][0] * d.x + T[1][1] * d.y,
        };
        worst = Math.max(worst, Math.hypot(got.x - want.x, got.y - want.y));
        checked++;
      }
    }
    // The part totals pinned by "agrees with upstream's usage counts" above.
    expect(checked).toBe(1260);
    expect(worst).toBeLessThan(1e-9);
  });

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
  // Pinned three ways: the F parts' inline footprint is upstream's to the
  // vertex, the Z parts' is still a 6-vertex L but now on upstream's bounding
  // box, and the three parts under neither rule stay on their template (an
  // inline footprint appearing there would mean a part had quietly changed
  // rules).
  it("draws the upstreamFootprint parts from upstream's own footprint", () => {
    const inlined = Object.entries(PART_TO_TEMPLATE)
      .filter(([, v]) => v.upstreamFootprint)
      .map(([part]) => part);
    expect(inlined).toEqual(["tower", "generator"]);

    let worst = 0;
    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const srcParent = layouts[i].parentOf;
      const outParent = normalized[i].parentOf;
      for (const child of normalized[i].pieces) {
        if (child.piece_type !== "feature") continue;
        const areaId = child.parent_area_id;
        const composite = byId.get(srcParent(areaId).template);
        const feature = composite.features.find(
          (f) => `${areaId}-${f.id}` === child.id,
        );
        const part = partOf(feature.template);
        if (!PART_TO_TEMPLATE[part].upstreamFootprint) {
          // Only the three parts under neither F nor Z resolve through their
          // template alone; everything else carries an inline footprint, and
          // a `corner-*` one has to be the legacy L resized onto upstream's
          // rectangle (Z), never upstream's bare rectangle - that would throw
          // away the L shape ruin-to-feature.mjs reads its arms from.
          if (!PART_TO_TEMPLATE[part].upstreamSize) {
            expect(child.footprint, `${child.id} (${part})`).toBeUndefined();
            continue;
          }
          const ring = footprintPolygon(child.footprint);
          expect(ring.length, `${child.id} (${part})`).toBe(6);
          // Q turns the legacy drawing into the part's frame, so a quarter-turn
          // swaps which upstream side each legacy axis has to match.
          const want = bboxSize(partExtent(upstreamPartOf(feature)));
          const quarter = PART_TO_TEMPLATE[part].turn % 180 !== 0;
          const got = bboxSize(child.footprint);
          expect(
            [got.width, got.height],
            `${child.id} (${part}) resized bbox`,
          ).toEqual(quarter ? [want.height, want.width] : [want.width, want.height]);
          continue;
        }
        // Upstream's model extent, which since the re-source has to be rebuilt
        // from the roof and the walls together rather than read off `footprint`.
        expect(child.footprint).toEqual(partExtent(upstreamPartOf(feature)));
        // Same footprint, same frame: the emitted child must land on upstream's
        // outline vertex for vertex, not merely near it.
        const truth = resolvePiece(
          upstreamPart(feature, upstreamPartOf(feature), areaId),
          footprintOf,
          srcParent,
        );
        worst = Math.max(
          worst,
          ringMismatch(resolvePiece(child, footprintOf, outParent), truth),
        );
        checked++;
      }
    }
    expect(checked).toBe(180); // the tower + generator counts pinned above
    expect(worst).toBeLessThan(1e-9);
  });

  it("composes the child's orientation matrix exactly, including K and Q", () => {
    // The anchor test above compares a single point, so it cannot detect a
    // chirality error, and it only detects a wrong Q through that point's
    // offset. This test compares 2x2 orientation matrices directly instead:
    // matmul(outParent, child) must equal matmul(srcParent, featureRotation)
    // . K . Q, where K and Q are recomputed here from the module's parity/flip
    // rule and the registered turn (not read off the emitted piece), so a bug in
    // how either is derived or applied - wrong side, wrong sign, wrong order -
    // shows up as a matrix mismatch.
    let worst = 0;
    for (let i = 0; i < layouts.length; i++) {
      const src = layouts[i];
      const out = normalized[i];
      const srcParent = src.parentOf;
      const outParent = out.parentOf;
      for (const child of out.pieces) {
        if (child.piece_type !== "feature") continue;
        const areaId = child.parent_area_id;
        const srcArea = srcParent(areaId);
        const composite = byId.get(srcArea.template);
        const feature = composite.features.find(
          (f) => `${areaId}-${f.id}` === child.id,
        );
        const { flip, turn } = PART_TO_TEMPLATE[partOf(feature.template)];
        const Msrc = pieceMatrix(srcArea);
        // The feature's own map, which upstream may now mirror as well as
        // rotate. P cancels the parity of everything above the part, so it reads
        // det(Msrc . Mf) rather than det(Msrc) alone.
        const Mf = pieceMatrix(feature);
        const K = matmul(
          det(matmul(Msrc, Mf)) < 0 ? FLIP_Y : IDENTITY,
          flip ? FLIP_X : IDENTITY,
        );
        const want = matmul(matmul(Msrc, Mf), matmul(K, rotation(turn)));
        const got = matmul(pieceMatrix(outParent(areaId)), pieceMatrix(child));
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 2; c++) {
            worst = Math.max(worst, Math.abs(want[r][c] - got[r][c]));
          }
        }
      }
    }
    expect(worst).toBeLessThan(1e-9);
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

// Upstream's own composite outline is the one frame in this file that no rule of
// ours takes part in: it is a 167-348 vertex trace of the real model, shipped
// alongside the parts it contains. So it is the only check here that can catch a
// misread anchor - `upstreamPart` above reads `position` through the same
// corrections `normalizeLayout` does, and would agree with a wrong one.
//
// It has already earned that: the mirrored generator hung 3.7in out of its own
// parent before `mirrorAnchorFix`, with the whole suite green.
describe("parts sit inside the composite that contains them", () => {
  // Two, both `ab` in the same Triangle footprint, at 2.870in. Verified as
  // upstream's own: bm-recon-vs-assets-01 reproduces the pre-pull corpus exactly
  // there, so the port is carrying the overhang across rather than causing it.
  const KNOWN_OVERHANG = {
    "bm-composite-triangle-ab-corner-02-4b8322162e/feature-1": 2.871,
    "bm-composite-triangle-ab-corner-02-8d39f1ed78/feature-1": 2.871,
  };

  it("keeps every part's model within its composite's traced outline", () => {
    for (const composite of byId.values()) {
      if (!isCompositeTemplate(composite.id)) continue;
      const ring = footprintPolygon(composite.footprint);
      // Feature positions are measured from the composite's area centroid - the
      // same anchor resolvePiece places the area on.
      const origin = centroid(ring);
      for (const feature of composite.features ?? []) {
        const part = upstreamPartOf(feature);
        const Mf = pieceMatrix(feature);
        const shift = matvec(Mf, partAnchorShift(part));
        const fix = mirrorAnchorFix(part, feature);
        const c = {
          x: origin.x + feature.position.x + fix.x + shift.x,
          y: origin.y + feature.position.y + fix.y + shift.y,
        };
        const { width, height } = bboxSize(partExtent(part));
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sx, sy]) => {
          const v = matvec(Mf, { x: (sx * width) / 2, y: (sy * height) / 2 });
          return { x: c.x + v.x, y: c.y + v.y };
        });
        const out = Math.max(
          0,
          ...corners
            .filter((p) => !pointInRing(p, ring))
            .map((p) =>
              Math.min(
                ...ring.map((_, i) =>
                  pointSegmentDistance(p, ring[i], ring[(i + 1) % ring.length]),
                ),
              ),
            ),
        );
        const key = `${composite.id}/${feature.id}`;
        // 0.01in absorbs the trace: eight parts sit up to 0.0015in proud of an
        // outline drawn round them by hand. Everything else is exactly inside.
        expect(out, key).toBeLessThan(KNOWN_OVERHANG[key] ?? 0.01);
      }
    }
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

  it("is 180-degree rotationally symmetric about the board centre", () => {
    let worst = 0;
    let worstAt = "";
    for (const layout of normalized) {
      const getParent = layout.parentOf;
      const pts = layout.pieces.map((p) => ({
        kind: p.piece_type,
        c: centroid(resolvePiece(p, footprintOf, getParent)),
      }));
      for (const a of pts) {
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
