import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
} from "./battlemaster-normalize.mjs";

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
