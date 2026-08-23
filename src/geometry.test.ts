import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  FLIP_X,
  FLIP_Y,
  IDENTITY,
  bounds,
  boundsCentre,
  boundsCorners,
  boundsSize,
  centroid,
  cross,
  det,
  distance,
  matmul,
  matvec,
  normalizeDegrees,
  pointInRing,
  pointSegmentDistance,
  ringGap,
  ringMismatch,
  ringsOverlap,
  rotate,
  rotationMatrix,
  segmentsCross,
  toDegrees,
  toRadians,
  type Ring,
} from "./geometry.js";

/**
 * These predicates used to be spelled per file — four bounding boxes in three
 * conventions, two incompatible `matvec`s, `((d % 360) + 360) % 360` four
 * times — and were only ever exercised incidentally, through whichever
 * converter happened to call them. One of them (the polygon gap in
 * `objective-icons.mjs`) sat one edit behind its twin for exactly that reason.
 *
 * So they get tested here, directly, on the cases that distinguish them from
 * the almost-right version.
 */

const unitSquare: Ring = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** An axis-aligned rectangle as a ring, in TL, TR, BR, BL order. */
const rect = (x: number, y: number, w: number, h: number): Ring => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe("the module itself", () => {
  it("imports nothing, so plain Node can load it from a .mjs converter", () => {
    // Node's type stripping does not rewrite specifiers, so it cannot follow
    // the `./foo.js`-means-`./foo.ts` convention the rest of src/ uses. One
    // import here and `pnpm convert:40kdc` stops resolving.
    const source = readFileSync(new URL("./geometry.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
    // A bare `import` is not the only way to name another module: a re-export
    // (`export { x } from "./y.js"`) and a dynamic `import("./y.js")` both
    // carry a specifier Node cannot resolve either, and neither starts a line
    // with `import`.
    expect(source).not.toMatch(/\bfrom\s*["']/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });
});

describe("normalizeDegrees", () => {
  it("folds any angle into [0, 360)", () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(-450)).toBe(270);
    expect(normalizeDegrees(725)).toBe(5);
  });
});

describe("toRadians / toDegrees", () => {
  it("round-trip", () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 12);
    expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 12);
  });
});

describe("rotate", () => {
  it("turns clockwise on screen, because y grows downward", () => {
    const p = rotate({ x: 1, y: 0 }, toRadians(90));
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
  });
});

describe("2x2 maps", () => {
  it("matmul applies B first, then A", () => {
    // Flip x, then rotate 90: (1,0) -> (-1,0) -> (0,-1).
    const M = matmul(rotationMatrix(90), FLIP_X);
    const p = matvec(M, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(-1, 12);
  });

  it("det is negative exactly for handedness-reversing maps", () => {
    expect(det(IDENTITY)).toBe(1);
    expect(det(FLIP_X)).toBe(-1);
    expect(det(FLIP_Y)).toBe(-1);
    expect(det(rotationMatrix(37))).toBeCloseTo(1, 12);
    expect(det(matmul(FLIP_X, FLIP_Y))).toBeCloseTo(1, 12);
  });

  it("matvec takes and returns a point, not a pair", () => {
    // The two old copies disagreed on exactly this, which is why there is one.
    expect(matvec(FLIP_Y, { x: 3, y: 4 })).toEqual({ x: 3, y: -4 });
  });
});

describe("bounds", () => {
  const ring = rect(-2, 1, 6, 4);

  it("reports extents, size and centre consistently", () => {
    expect(bounds(ring)).toEqual({ minX: -2, minY: 1, maxX: 4, maxY: 5 });
    expect(boundsSize(ring)).toEqual({ width: 6, height: 4 });
    expect(boundsCentre(ring)).toEqual({ x: 1, y: 3 });
  });

  it("distinguishes extent from far edge when the box does not start at 0,0", () => {
    // The converters need both, and conflating them shifts a placement by the
    // offset — which is exactly what a `Math.max`-only bbox hides.
    expect(boundsSize(ring).width).toBe(6);
    expect(bounds(ring).maxX).toBe(4);
  });

  it("orders corners TL, TR, BR, BL so index + 2 is the diagonal", () => {
    expect(boundsCorners(ring)).toEqual([
      { x: -2, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 5 },
      { x: -2, y: 5 },
    ]);
  });
});

describe("centroid", () => {
  it("is the area centroid, not the vertex average", () => {
    // An L: vertex average and area centroid differ, which is the whole reason
    // `anchorOffset` exists.
    const L: Ring = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ];
    const c = centroid(L);
    expect(c.x).toBeCloseTo(5 / 6, 12);
    expect(c.y).toBeCloseTo(5 / 6, 12);
    const vertexAverage = L.reduce((s, p) => s + p.x, 0) / L.length;
    expect(c.x).not.toBeCloseTo(vertexAverage, 6);
  });

  it("falls back to the vertex average for a degenerate ring", () => {
    const line: Ring = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(centroid(line)).toEqual({ x: 2, y: 0 });
  });
});

describe("ringMismatch", () => {
  it("is zero for the same vertices in any order", () => {
    expect(ringMismatch(unitSquare, [...unitSquare].reverse())).toBe(0);
  });

  it("reports the worst vertex displacement", () => {
    const shifted = unitSquare.map((p) => ({ x: p.x + 0.25, y: p.y }));
    expect(ringMismatch(unitSquare, shifted)).toBeCloseTo(0.25, 12);
  });
});

describe("pointSegmentDistance", () => {
  it("clamps to the segment rather than measuring to its infinite line", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    expect(pointSegmentDistance({ x: 0.5, y: 2 }, a, b)).toBeCloseTo(2, 12);
    expect(pointSegmentDistance({ x: 5, y: 0 }, a, b)).toBeCloseTo(4, 12);
  });

  it("handles a zero-length segment", () => {
    const a = { x: 3, y: 4 };
    expect(pointSegmentDistance({ x: 0, y: 0 }, a, a)).toBeCloseTo(5, 12);
  });
});

describe("segmentsCross", () => {
  const h = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ] as const;
  const v = [
    { x: 2, y: -1 },
    { x: 2, y: 1 },
  ] as const;

  it("is true only when each segment straddles the other", () => {
    expect(segmentsCross(h[0], h[1], v[0], v[1])).toBe(true);
    expect(
      segmentsCross(h[0], h[1], { x: 2, y: 1 }, { x: 2, y: 3 }),
    ).toBe(false);
  });

  it("is false for a shared endpoint", () => {
    expect(
      segmentsCross(h[0], h[1], { x: 0, y: 0 }, { x: 0, y: 3 }),
    ).toBe(false);
  });
});

describe("ringGap", () => {
  it("measures the clear distance between separated rings", () => {
    expect(ringGap(unitSquare, rect(3, 0, 1, 1))).toBeCloseTo(2, 12);
  });

  it("is zero for crossing rings with no vertex inside either", () => {
    // The plus shape: a wide bar laid across a tall bar. Every vertex of each
    // is well outside the other, so a vertex-to-edge gap reads it as clear —
    // the bug the crossing test exists to close. This is the "catwalk resting
    // on a ruin arm" case, and the 40kdc objective clustering hits it too.
    const wide = rect(-3, -0.25, 6, 0.5);
    const tall = rect(-0.25, -3, 0.5, 6);
    const vertexOnly = Math.min(
      ...wide.flatMap((p) =>
        tall.map((_, j) =>
          pointSegmentDistance(p, tall[j], tall[(j + 1) % tall.length]),
        ),
      ),
    );
    expect(vertexOnly).toBeGreaterThan(0.2);
    expect(ringGap(wide, tall)).toBe(0);
  });
});

describe("ringsOverlap", () => {
  it("is false for disjoint rings", () => {
    expect(ringsOverlap(unitSquare, rect(3, 0, 1, 1))).toBe(false);
  });

  it("is true when one ring nests inside the other", () => {
    expect(ringsOverlap(rect(0.25, 0.25, 0.5, 0.5), unitSquare)).toBe(true);
    expect(ringsOverlap(unitSquare, rect(0.25, 0.25, 0.5, 0.5))).toBe(true);
  });

  it("is true for a plus, where neither ring has a vertex inside the other", () => {
    const wide = rect(-3, -0.25, 6, 0.5);
    const tall = rect(-0.25, -3, 0.5, 6);
    expect(wide.some((p) => pointInRing(p, tall))).toBe(false);
    expect(tall.some((p) => pointInRing(p, wide))).toBe(false);
    expect(ringsOverlap(wide, tall)).toBe(true);
  });

  it("decides touching rings inconsistently, which is why gap is the contact test", () => {
    // Characterization, not a guarantee. `pointInRing` documents edge points
    // as undefined, and that undefinedness reaches ringsOverlap: whether a
    // touching pair reads true comes down to which vertex the ray cast
    // happens to catch, so the answer changes with how the contact is shaped.
    expect(ringsOverlap(unitSquare, unitSquare)).toBe(true);
    expect(ringsOverlap(unitSquare, rect(1, 0, 1, 1))).toBe(true);
    expect(ringsOverlap(unitSquare, rect(1, 0.25, 1, 0.5))).toBe(false);

    // `ringGap` is exact on all three, which is why the objective-icon
    // clustering asks it rather than ringsOverlap.
    expect(ringGap(unitSquare, unitSquare)).toBe(0);
    expect(ringGap(unitSquare, rect(1, 0, 1, 1))).toBe(0);
    expect(ringGap(unitSquare, rect(1, 0.25, 1, 0.5))).toBe(0);
  });
});

describe("pointInRing", () => {
  it("separates inside from outside", () => {
    expect(pointInRing({ x: 0.5, y: 0.5 }, unitSquare)).toBe(true);
    expect(pointInRing({ x: 1.5, y: 0.5 }, unitSquare)).toBe(false);
  });

  it("handles a concave ring", () => {
    const L: Ring = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(pointInRing({ x: 0.5, y: 1.5 }, L)).toBe(true);
    expect(pointInRing({ x: 1.5, y: 1.5 }, L)).toBe(false);
  });
});

describe("distance and cross", () => {
  it("distance is symmetric", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(distance(a, b)).toBe(5);
    expect(distance(b, a)).toBe(5);
  });

  it("cross changes sign with the turn direction", () => {
    const o = { x: 0, y: 0 };
    expect(cross(o, { x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
    expect(cross(o, { x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1);
    expect(cross(o, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(0);
  });
});
