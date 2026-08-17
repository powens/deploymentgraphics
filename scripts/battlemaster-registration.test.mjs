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
  rotation,
  IDENTITY,
  FLIP_X,
  FLIP_Y,
  normalizeLayout,
} from "./battlemaster-normalize.mjs";
import { resolvePiece, centroid } from "./terrain-resolver.mjs";
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
  it("places every child exactly where the composite frame puts it", () => {
    let worst = 0;
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
        // Resolve the *same* battlemaster part footprint under both frames, so
        // this isolates position and orientation from the template swap.
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
        const got = resolvePiece(
          { ...child, template: feature.template },
          lookupFootprint,
          outParent,
        );
        worst = Math.max(worst, ringMismatch(truth, got));
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
    expect([...(seen["corner-short"] ?? [])].sort()).toEqual([
      "l-ruin",
      "l-ruin-mirror",
    ]);
    for (const template of [
      "corner-ruin-balanced-left",
      "corner-ruin-balanced-right",
      "corner-ruin-left",
      "corner-ruin-right",
      "corner-tiny",
    ]) {
      expect([...seen[template]], template).toHaveLength(1);
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
    // Upstream's own residual asymmetry: 0.707in on 4 areas and 8 features.
    expect(worst).toBeLessThan(1.0);
    expect(loose.area).toBeLessThanOrEqual(4);
    expect(loose.feature).toBeLessThanOrEqual(8);
  });
});
