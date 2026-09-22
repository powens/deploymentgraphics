/**
 * Pure plane geometry shared by the renderer (`src/`) and the 40kdc converters
 * (`scripts/`). No board, template or placement vocabulary here.
 *
 * Must have **no imports**: the `.mjs` converters load this under plain Node
 * with type stripping, which does not rewrite `./foo.js` specifiers, so any
 * import here would break `make update-terrain`.
 *
 * ## Conventions
 *
 * - A **point** is `{ x, y }`, never a `[x, y]` pair.
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
 * `oa` × `ob`: twice the signed area of triangle `o, a, b`; zero when
 * collinear. Only the sign relative to another cross product is meaningful.
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

/** Axis-aligned bounding box of a ring, as extents. */
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
 * Area centroid of a simple polygon (shoelace). A zero-area ring falls back to
 * the vertex average rather than `NaN`.
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
 * Hausdorff distance over the two rings' vertex sets; zero when they have the
 * same vertices in any order.
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
 * Do segments `p`–`q` and `r`–`s` properly cross? True only when each strictly
 * straddles the other's line, so a shared endpoint or collinear overlap is
 * false. `ringGap` needs this because endpoint distances alone are all
 * positive for crossing segments.
 */
export function segmentsCross(p: Point, q: Point, r: Point, s: Point): boolean {
  // Strict on both sides: treating zero as negative would make a T-junction's
  // answer depend on which side of the crossbar the stem points.
  const straddles = (u: number, v: number) =>
    (u > 0 && v < 0) || (u < 0 && v > 0);
  return (
    straddles(cross(r, s, p), cross(r, s, q)) &&
    straddles(cross(p, q, r), cross(p, q, s))
  );
}

/**
 * Smallest distance between the edges of two closed rings; 0 when edges cross
 * or touch. Measures edges, not area: a ring nested inside another gaps by its
 * clearance, not 0. Use `ringsOverlap` for shared ground.
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
 * Do two closed rings share ground? Vertex containment catches nesting and
 * corner overlap; the edge-crossing pass catches a plus-shaped overlap.
 *
 * Rings that only touch are decided inconsistently (`pointInRing` leaves edge
 * points undefined); use `ringGap(a, b) === 0` for contact.
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
