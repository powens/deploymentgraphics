/**
 * Plane geometry — the primitives both halves of the codebase are built on.
 *
 * The renderer (`src/`) and the 40kdc converters (`scripts/`) each need rings,
 * bounding boxes, centroids, 2×2 linear maps, degree normalisation and
 * polygon proximity. Before this module they each spelled their own: `matvec`
 * existed twice with incompatible signatures, a bounding box four times in
 * three conventions, `((d % 360) + 360) % 360` four times, and the
 * segment-crossing predicate lived in a test file next to a second copy
 * elsewhere that never received its fix.
 *
 * So this owns them, once. Everything here is pure: points in, points out, no
 * board, template, piece or placement vocabulary. Anything that knows what a
 * *building* or a *piece* is belongs a layer up — `building-coordinates.ts`
 * and `placement.ts` on the renderer side, `terrain-resolver.mjs` on the
 * converter side.
 *
 * The converters are `.mjs` and import this by its `.ts` path, the way their
 * tests already import `placement.ts`; Node strips the types at load
 * (`--experimental-strip-types`, passed explicitly by the `convert:40kdc`
 * scripts so it does not depend on the version where that became the default).
 *
 * That is why this module has **no imports of its own** and must keep none.
 * Type stripping does not rewrite specifiers, so plain Node cannot follow the
 * `./foo.js`-means-`./foo.ts` convention the rest of `src/` is written in —
 * a single import here would break `make update-terrain`. Vitest resolves
 * those specifiers, so the *tests* under `scripts/` may still import
 * `placement.ts` and friends; the production converters may not.
 *
 * ## Conventions
 *
 * - A **point** is `{ x, y }`. Never a `[x, y]` pair — that was the other
 *   `matvec`, and having two was the bug.
 * - A **ring** is a closed polygon given as its vertices, without repeating
 *   the first at the end. Winding is not assumed.
 * - **Angles** are degrees unless a name says `Radians`.
 * - y grows downward (SVG), so a positive rotation turns clockwise on screen.
 */

/** A point in the plane. */
export type Point = { x: number; y: number };

/** A closed polygon, as vertices with no repeated final point. */
export type Ring = Point[];

/** A 2×2 linear map, row-major: `[[a, b], [c, d]]`. */
export type Matrix2 = readonly [
  readonly [number, number],
  readonly [number, number],
];

/** An axis-aligned bounding box, as its extents. */
export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

// --- Angles ---------------------------------------------------------------

/** Folds any angle into `[0, 360)`. */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Degrees to radians. */
export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Radians to degrees. */
export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

// --- Points ---------------------------------------------------------------

/** Rotates a point about the origin by `rad` radians. */
export function rotate(p: Point, rad: number): Point {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** Straight-line distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The cross product of `oa` × `ob` — twice the signed area of the triangle
 * `o, a, b`. Positive when `o → a → b` turns one way, negative the other, zero
 * when collinear; which way is which depends on the axis orientation, so
 * callers care about the sign relative to another cross product, not its
 * absolute meaning.
 */
export function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// --- 2×2 linear maps ------------------------------------------------------

/** The identity map. */
export const IDENTITY: Matrix2 = [
  [1, 0],
  [0, 1],
];

/** Reflection in the y axis (negates x). */
export const FLIP_X: Matrix2 = [
  [-1, 0],
  [0, 1],
];

/** Reflection in the x axis (negates y). */
export const FLIP_Y: Matrix2 = [
  [1, 0],
  [0, -1],
];

/** Composes two linear maps: the result applies `B` first, then `A`. */
export function matmul(A: Matrix2, B: Matrix2): Matrix2 {
  return [
    [
      A[0][0] * B[0][0] + A[0][1] * B[1][0],
      A[0][0] * B[0][1] + A[0][1] * B[1][1],
    ],
    [
      A[1][0] * B[0][0] + A[1][1] * B[1][0],
      A[1][0] * B[0][1] + A[1][1] * B[1][1],
    ],
  ];
}

/** Applies a linear map to a point. */
export function matvec(A: Matrix2, p: Point): Point {
  return {
    x: A[0][0] * p.x + A[0][1] * p.y,
    y: A[1][0] * p.x + A[1][1] * p.y,
  };
}

/** Determinant — negative exactly when the map reverses handedness. */
export function det(A: Matrix2): number {
  return A[0][0] * A[1][1] - A[0][1] * A[1][0];
}

/** Rotation by `deg` degrees, as a linear map. */
export function rotationMatrix(deg: number): Matrix2 {
  const t = toRadians(deg);
  return [
    [Math.cos(t), -Math.sin(t)],
    [Math.sin(t), Math.cos(t)],
  ];
}

// --- Bounding boxes -------------------------------------------------------

/**
 * The axis-aligned bounding box of a ring, as extents. `boundsSize` and
 * `boundsCentre` derive the two other shapes callers want, so a caller never
 * has to decide which one a helper named `bbox` happens to return.
 */
export function bounds(ring: Ring): Bounds {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Width and height of a ring's bounding box. */
export function boundsSize(ring: Ring): { width: number; height: number } {
  const b = bounds(ring);
  return { width: b.maxX - b.minX, height: b.maxY - b.minY };
}

/** Centre of a ring's bounding box. */
export function boundsCentre(ring: Ring): Point {
  const b = bounds(ring);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** The four bounding-box corners, in TL, TR, BR, BL order — index + 2 is the diagonal. */
export function boundsCorners(ring: Ring): [Point, Point, Point, Point] {
  const { minX, minY, maxX, maxY } = bounds(ring);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

// --- Rings ----------------------------------------------------------------

/**
 * Area centroid of a simple polygon (shoelace). Falls back to the vertex
 * average for a degenerate (zero-area) ring, so a collapsed footprint still
 * returns a usable point rather than `NaN`.
 */
export function centroid(ring: Ring): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const c = p.x * q.y - q.x * p.y;
    area += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  if (area === 0) {
    const n = ring.length;
    return {
      x: ring.reduce((s, p) => s + p.x, 0) / n,
      y: ring.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

/**
 * How far apart two rings are: the largest distance from a vertex of either
 * ring to the nearest vertex of the other (Hausdorff over vertex sets). Zero
 * when they have the same vertices in any order. Used by the converter tests
 * to check an emitted placement reproduces the ring the source resolves to.
 */
export function ringMismatch(a: Ring, b: Ring): number {
  const near = (p: Point, ring: Ring) =>
    Math.min(...ring.map((q) => distance(p, q)));
  return Math.max(...a.map((p) => near(p, b)), ...b.map((p) => near(p, a)));
}

// --- Proximity and overlap ------------------------------------------------

/** Distance from point `p` to the segment `a`–`b`. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Do segments `p`–`q` and `r`–`s` properly cross? True only when each segment
 * strictly straddles the other's line, so a shared endpoint or a collinear
 * overlap reads false.
 *
 * `ringGap` needs this because endpoint-to-segment distance alone cannot see a
 * crossing: for two segments that cross, all four endpoint distances are
 * strictly positive. A 7×2in catwalk laid squarely across a 0.5in ruin arm —
 * the literal "resting on it" case — would otherwise measure 0.5in clear,
 * indistinguishable from a piece genuinely standing 0.5in away.
 */
export function segmentsCross(p: Point, q: Point, r: Point, s: Point): boolean {
  // Strictly opposite, so a zero — an endpoint sitting on the other segment's
  // line — reads as "does not straddle". Comparing `d > 0` alone would fold
  // zero in with the negatives, which makes a T-junction answer depend on
  // which side of the crossbar the stem points: `segmentsCross((0,0), (4,0),
  // (2,0), (2,2))` would read true and its mirror image false.
  const straddles = (u: number, v: number) =>
    (u > 0 && v < 0) || (u < 0 && v > 0);
  return (
    straddles(cross(r, s, p), cross(r, s, q)) &&
    straddles(cross(p, q, r), cross(p, q, s))
  );
}

/**
 * Smallest distance between the edges of two closed rings — 0 when their edges
 * cross or touch, so callers can ask how far apart two pieces are rather than
 * comparing centroids.
 *
 * This measures edges, not areas: a ring nested wholly inside another with
 * clearance all round gaps by that clearance, not 0, however completely the
 * two overlap. `ringsOverlap` is the predicate for "do these share ground".
 */
export function ringGap(a: Ring, b: Ring): number {
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j];
      const s = b[(j + 1) % b.length];
      if (segmentsCross(p, q, r, s)) return 0;
      min = Math.min(
        min,
        pointSegmentDistance(p, r, s),
        pointSegmentDistance(q, r, s),
        pointSegmentDistance(r, p, q),
        pointSegmentDistance(s, p, q),
      );
    }
  }
  return min;
}

/** Is `p` inside `ring`? Even–odd ray cast; points on the edge are undefined. */
export function pointInRing(p: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (
      ring[i].y > p.y !== ring[j].y > p.y &&
      p.x <
        ((ring[j].x - ring[i].x) * (p.y - ring[i].y)) /
          (ring[j].y - ring[i].y) +
          ring[i].x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Do two closed rings share ground? Vertex containment either way catches
 * nesting and corner overlap; the edge-crossing pass catches the plus-shaped
 * overlap where neither ring has a vertex inside the other.
 *
 * Rings that only touch are not decided consistently, because `pointInRing`
 * leaves edge points undefined: two coincident rings and two rectangles
 * sharing a whole edge both read true (one vertex happens to ray-cast inside),
 * while rectangles sharing part of an edge read false. Callers that care about
 * contact rather than shared area should ask `ringGap(a, b) === 0`, which is
 * exact on all three. The corpus has no coincident objective footprints, so
 * nothing downstream depends on which way these fall today.
 */
export function ringsOverlap(a: Ring, b: Ring): boolean {
  if (a.some((p) => pointInRing(p, b)) || b.some((p) => pointInRing(p, a))) {
    return true;
  }
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (
        segmentsCross(
          a[i],
          a[(i + 1) % a.length],
          b[j],
          b[(j + 1) % b.length],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}
