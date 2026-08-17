import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import {
  SIZE_CLASS,
  PART_TO_TEMPLATE,
  VARIANT,
  isCompositeTemplate,
  classOf,
  partOf,
  decompose,
  matmul,
  det,
  rotation,
  pieceMatrix,
  IDENTITY,
  FLIP_X,
  FLIP_Y,
  normalizeLayout,
  bboxCentre,
} from "./battlemaster-normalize.mjs";
import { resolvePiece, centroid, footprintPolygon } from "./terrain-resolver.mjs";
import { areaBuildingPlacement } from "./area-to-building.mjs";
import { ruinFeaturePlacement } from "./ruin-to-feature.mjs";

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../static/data/terrain/source/40kdc/${name}`, import.meta.url),
      "utf8",
    ),
  );
const layouts = read("terrain-layouts.json").filter((l) => l.mission_matchup_id);
const templates = read("terrain-templates.json");
const byId = new Map(templates.map((t) => [t.id, t]));
const fpById = new Map(templates.map((t) => [t.id, t.footprint]));

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

  it("targets legacy templates that still exist upstream", () => {
    for (const id of Object.values(SIZE_CLASS)) expect(fpById.has(id)).toBe(true);
    for (const { template } of Object.values(PART_TO_TEMPLATE)) {
      expect(fpById.has(template)).toBe(true);
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
    expect(classes).toEqual({ BR: 180, LL: 90, SL: 180, SR: 180, TR: 90 });
    expect(parts).toEqual({
      ab: 90,
      co: 92,
      corner: 90,
      ef: 86,
      generator: 90,
      gh: 92,
      "long-barrier": 90,
      pipes: 90,
      "short-barrier": 180,
      "small-l": 90,
      "small-l-flip": 180,
      tower: 90,
    });
  });

  // The guard that stops a new upstream rigid variant from silently rendering
  // ~6in out of place: every composite footprint must be its archetype's
  // polygon under the registered V, compared in each ring's own centred frame.
  it("accounts for every composite footprint as a registered rigid variant", () => {
    const centredRing = (footprint) => {
      const pts = footprint.points;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      return pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
    };
    const matches = (a, b) =>
      a.length === b.length &&
      a.every((p) =>
        b.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6),
      );

    for (const composite of templates.filter((t) => isCompositeTemplate(t.id))) {
      const archetype = fpById.get(SIZE_CLASS[classOf(composite)]);
      const V = VARIANT[composite.id] ?? IDENTITY;
      const want = centredRing(archetype).map((p) => ({
        x: V[0][0] * p.x + V[0][1] * p.y,
        y: V[1][0] * p.x + V[1][1] * p.y,
      }));
      expect(
        matches(centredRing(composite.footprint), want),
        `${composite.id} is not the registered rigid variant of its archetype`,
      ).toBe(true);
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
      Object.entries(PART_TO_TEMPLATE).map(([part, v]) => [part, v.turn]),
    );
    expect(turns).toEqual({
      ab: 180,
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

  it("registers only self-inverse variants", () => {
    for (const [id, V] of Object.entries(VARIANT)) {
      // +0 canonicalizes IEEE-754 -0 (e.g. (-1)*0) to 0 before the deep-equal,
      // which otherwise distinguishes signed zero even though -0 === 0.
      const VV = matmul(V, V).map((row) => row.map((x) => x + 0));
      expect(VV, `${id} is not its own inverse`).toEqual(IDENTITY);
    }
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

const lookupFootprint = (id) => fpById.get(id);
const gwTemplates = yaml.load(
  readFileSync(
    new URL("../static/data/terrain/templates-simple.yml", import.meta.url),
    "utf8",
  ),
).templates;

const normalized = layouts.map((l) => normalizeLayout(l, byId));
const parentsOf = (l) => {
  const map = new Map(l.pieces.map((p) => [p.id, p]));
  return (id) => map.get(id);
};

// Max distance from each vertex of one ring to the nearest vertex of the other,
// in both directions (Hausdorff over vertex sets).
const ringMismatch = (a, b) => {
  const near = (p, ring) =>
    Math.min(...ring.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
  return Math.max(...a.map((p) => near(p, b)), ...b.map((p) => near(p, a)));
};

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
  it("anchors every child on the upstream part's rectangle centre", () => {
    let worst = 0;
    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const src = layouts[i];
      const out = normalized[i];
      const srcParent = parentsOf(src);
      const outParent = parentsOf(out);
      for (const child of out.pieces) {
        if (child.piece_type !== "feature") continue;
        const areaId = child.parent_area_id;
        const composite = byId.get(srcParent(areaId).template);
        const feature = composite.features.find(
          (f) => `${areaId}-${f.id}` === child.id,
        );
        // Where upstream puts the part's rectangle centre. Every Battlemaster
        // part footprint is a rectangle (measured: 12 of 12), so its resolved
        // centroid is its resolved bbox centre.
        const want = centroid(
          resolvePiece(
            {
              id: "truth",
              template: feature.template,
              position: feature.position,
              rotation_degrees: feature.rotation_degrees ?? 0,
              parent_area_id: areaId,
            },
            lookupFootprint,
            srcParent,
          ),
        );
        // Where the emitted piece puts its own polygon's bbox centre. The
        // resolved ring's centroid is the image of the footprint's centroid, so
        // step from there to the bbox centre through the piece's own map.
        // `child.footprint` first, for the parts that carry upstream's own
        // rectangle instead of a legacy stand-in.
        const ring = footprintPolygon(
          child.footprint ?? lookupFootprint(child.template),
        );
        const T = matmul(pieceMatrix(outParent(areaId)), pieceMatrix(child));
        const d = {
          x: bboxCentre(ring).x - centroid(ring).x,
          y: bboxCentre(ring).y - centroid(ring).y,
        };
        const c = centroid(resolvePiece(child, lookupFootprint, outParent));
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

  // Where the legacy footprint is itself a plain rectangle it carries no shape
  // upstream's rectangle lacks, only a size - and the sizes disagree (generator
  // 3x4 against 4.5x2, tower 2x2 against 2x2.5). Those parts take upstream's
  // own rectangle, so the emitted piece reproduces upstream's outline exactly
  // rather than to within the ~0.2in a stand-in could manage. Pinned both ways:
  // the inline footprint is upstream's to the vertex, and no other part quietly
  // acquires one (which would bypass the legacy polygon a `corner-*` part
  // depends on for its L shape).
  it("draws the upstreamFootprint parts from upstream's own footprint", () => {
    const inlined = Object.entries(PART_TO_TEMPLATE)
      .filter(([, v]) => v.upstreamFootprint)
      .map(([part]) => part);
    expect(inlined).toEqual(["tower", "generator"]);

    let worst = 0;
    let checked = 0;
    for (let i = 0; i < layouts.length; i++) {
      const srcParent = parentsOf(layouts[i]);
      const outParent = parentsOf(normalized[i]);
      for (const child of normalized[i].pieces) {
        if (child.piece_type !== "feature") continue;
        const areaId = child.parent_area_id;
        const composite = byId.get(srcParent(areaId).template);
        const feature = composite.features.find(
          (f) => `${areaId}-${f.id}` === child.id,
        );
        const part = partOf(feature.template);
        if (!PART_TO_TEMPLATE[part].upstreamFootprint) {
          expect(child.footprint, `${child.id} (${part})`).toBeUndefined();
          continue;
        }
        expect(child.footprint).toEqual(lookupFootprint(feature.template));
        // Same footprint, same frame: the emitted child must land on upstream's
        // outline vertex for vertex, not merely near it.
        const truth = resolvePiece(
          {
            id: "truth",
            template: feature.template,
            position: feature.position,
            rotation_degrees: feature.rotation_degrees ?? 0,
            parent_area_id: areaId,
          },
          lookupFootprint,
          srcParent,
        );
        worst = Math.max(
          worst,
          ringMismatch(resolvePiece(child, lookupFootprint, outParent), truth),
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
      const srcParent = parentsOf(src);
      const outParent = parentsOf(out);
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
        const K = matmul(
          det(Msrc) < 0 ? FLIP_Y : IDENTITY,
          flip ? FLIP_X : IDENTITY,
        );
        const want = matmul(
          matmul(Msrc, rotation(feature.rotation_degrees ?? 0)),
          matmul(K, rotation(turn)),
        );
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
      const srcParent = parentsOf(layouts[i]);
      for (const piece of normalized[i].pieces) {
        if (piece.template !== "area-trapezoid") continue;
        const placement = areaBuildingPlacement(
          piece,
          lookupFootprint(piece.template),
          gwTemplates,
        );
        // Rebuild the rendered outline: TL is the template origin and the
        // TL->TR vector is its local +x axis.
        const gw = gwTemplates[placement.type];
        const local = gw.points ?? [
          { x: 0, y: 0 }, { x: gw.width, y: 0 },
          { x: gw.width, y: gw.height }, { x: 0, y: gw.height },
        ];
        const W = Math.max(...local.map((p) => p.x));
        const { TL, TR } = placement.corners;
        const ux = (TR.x - TL.x) / W;
        const uy = (TR.y - TL.y) / W;
        const drawn = local.map((p) => ({
          x: TL.x + p.x * ux - p.y * uy,
          y: TL.y + p.x * uy + p.y * ux,
        }));
        const truth = resolvePiece(
          srcParent(piece.id),
          lookupFootprint,
          srcParent,
        );
        worst = Math.max(worst, ringMismatch(drawn, truth));
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("renders each chiral part as exactly one l-ruin variant", () => {
    const seen = {};
    for (const layout of normalized) {
      const getParent = parentsOf(layout);
      for (const piece of layout.pieces) {
        if (piece.piece_type !== "feature") continue;
        if (!piece.template.startsWith("corner-")) continue;
        const placement = ruinFeaturePlacement(
          piece,
          lookupFootprint,
          getParent,
          false,
        );
        (seen[piece.template] ??= new Set()).add(placement.type);
      }
    }
    // corner-short carries both hands because small-l and small-l-flip are the
    // two hands of one model; every other legacy template takes a single part.
    //
    // Upstream's new data does not encode chirality at all: parts are
    // rectangles and no composite feature carries `mirror` (measured: 0 of
    // them), so this table is a reconstruction, not a re-read of upstream. It
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

describe("board invariants", () => {
  it("keeps every resolved vertex on the 60x44 board", () => {
    for (const layout of normalized) {
      const getParent = parentsOf(layout);
      for (const piece of layout.pieces) {
        for (const v of resolvePiece(piece, lookupFootprint, getParent)) {
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
    const loose = { area: 0, feature: 0 };
    for (const layout of normalized) {
      const getParent = parentsOf(layout);
      const pts = layout.pieces.map((p) => ({
        kind: p.piece_type,
        c: centroid(resolvePiece(p, lookupFootprint, getParent)),
      }));
      for (const a of pts) {
        const target = { x: 60 - a.c.x, y: 44 - a.c.y };
        const d = Math.min(
          ...pts
            .filter((b) => b.kind === a.kind)
            .map((b) => Math.hypot(b.c.x - target.x, b.c.y - target.y)),
        );
        worst = Math.max(worst, d);
        if (d > 0.25) loose[a.kind]++;
      }
    }
    // Upstream's own residual asymmetry: 0.707in on 4 areas and 8 features,
    // concentrated in disruption-vs-disruption-1 and
    // reconnaissance-vs-reconnaissance-2 (0.354in point-symmetry slip in
    // upstream's own data). Reproducing it is correct — this repo renders
    // upstream's data faithfully — but if a failure ever lands here, diff
    // against those two layout ids first before assuming a regression.
    expect(worst).toBeLessThan(1.0);
    expect(loose.area).toBeLessThanOrEqual(4);
    expect(loose.feature).toBeLessThanOrEqual(8);
  });
});
