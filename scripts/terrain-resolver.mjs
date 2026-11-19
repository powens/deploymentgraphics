// Owns the 40kdc piece pose (see Piece pose in CONTEXT.md), and resolves a
// piece through it: footprint precedence, its own frame and its parent's.
//
// Source model: `position` anchors the footprint's area centroid, and
// `rotation_degrees` and `mirror` apply about it. A child of `parent_area_id`
// is placed in the parent's centred frame, then carried through the parent's
// transform. Order: center -> mirror -> rotate -> translate, then the parent's
// mirror -> rotate -> translate. Verified against the upstream
// terrain-resolver conformance suite.

import {
  centroid,
  det,
  FLIP_X,
  FLIP_Y,
  IDENTITY,
  matmul,
  matvec,
  normalizeDegrees,
  rotationMatrix,
  toDegrees,
} from "../src/geometry.ts";

/** Footprint as a closed ring of { x, y } points. */
export function footprintPolygon(footprint) {
  if (footprint.type === "rectangle") {
    const { width: w, height: h } = footprint;
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  if (footprint.type === "polygon") {
    return footprint.points.map((p) => ({ x: p.x, y: p.y }));
  }
  throw new Error(`unsupported footprint type: ${footprint.type}`);
}

/**
 * A pose's linear map, R(rotation_degrees) . S(mirror): the reflection applies
 * first. "horizontal" negates x, "vertical" negates y. Either field may be
 * absent, so `{ mirror }` or `{ rotation_degrees }` alone gives that part.
 *
 * @param {{ rotation_degrees?: number, mirror?: string }} pose
 */
export function poseMatrix(pose) {
  const S =
    pose.mirror === "horizontal"
      ? FLIP_X
      : pose.mirror === "vertical"
        ? FLIP_Y
        : IDENTITY;
  return matmul(rotationMatrix(pose.rotation_degrees ?? 0), S);
}

/**
 * `normalizeDegrees` plus a float-noise snap: angles from `atan2` on composed
 * matrices arrive as 89.99999999999999 or just under 360, and would otherwise
 * be written into the emitted corpus verbatim.
 */
const normDeg = (deg) => {
  const r = Math.round(normalizeDegrees(deg) * 1e6) / 1e6;
  return r === 360 ? 0 : r;
};

/**
 * Inverse of {@link poseMatrix}: factor an orthogonal 2x2 back into the
 * `{ rotation_degrees, mirror }` pair a piece carries. An improper map always
 * comes back as a horizontal mirror; the rotation absorbs the difference
 * between the two mirror axes.
 */
export function poseFromMatrix(A) {
  const improper = det(A) < 0;
  const R = improper ? matmul(A, FLIP_X) : A;
  const out = {
    rotation_degrees: normDeg(toDegrees(Math.atan2(R[1][0], R[0][0]))),
  };
  if (improper) out.mirror = "horizontal";
  return out;
}

/** The pose's map from a frame anchored at `anchor` onto `position`. */
function posed(piece, anchor) {
  const matrix = poseMatrix(piece);
  return {
    matrix,
    place: (p) => {
      const o = matvec(matrix, { x: p.x - anchor.x, y: p.y - anchor.y });
      return { x: o.x + piece.position.x, y: o.y + piece.position.y };
    },
  };
}

/**
 * Resolve a piece onto the board, or `undefined` when it has neither an
 * inline footprint nor a known template. Prefer {@link resolvePiece} unless
 * absence is a case you handle.
 *
 * The piece draws from its own inline `footprint` when it has one, else its
 * template's. Its frame anchors that footprint's area centroid on `position`;
 * a child of `parent_area_id` lands in its parent's centred frame and is then
 * carried through the parent's pose.
 *
 * @param {object} piece - `position`, optional `rotation_degrees`, optional
 *   `mirror` ("horizontal"|"vertical"), optional `parent_area_id`, and either
 *   `footprint` or `template`.
 * @param {(id: string) => object | null | undefined} lookupFootprint
 * @param {(id: string) => object | undefined} [getParent] - required only for
 *   pieces carrying a `parent_area_id`.
 * @returns {{
 *   local: Array<{x: number, y: number}>,
 *   ring: Array<{x: number, y: number}>,
 *   matrix: number[][],
 *   place: (p: {x: number, y: number}) => {x: number, y: number},
 * } | undefined} `local` is the footprint ring in its own coordinates; `place`
 *   maps a footprint-local point onto the board, and `matrix` is its linear
 *   part; `ring` is `local` placed, vertex for vertex.
 */
export function resolvePieceIfAny(piece, lookupFootprint, getParent) {
  const footprint = piece.footprint ?? lookupFootprint(piece.template);
  if (!footprint) return undefined;
  const local = footprintPolygon(footprint);
  const own = posed(piece, centroid(local));
  const frame = piece.parent_area_id
    ? withinParent(piece, own, getParent)
    : own;
  return { local, ring: local.map(frame.place), ...frame };
}

/**
 * Like {@link resolvePieceIfAny}, but throws when the piece has neither an
 * inline footprint nor a known template.
 */
export function resolvePiece(piece, lookupFootprint, getParent) {
  const resolved = resolvePieceIfAny(piece, lookupFootprint, getParent);
  if (!resolved) {
    throw new Error(
      `piece ${piece.id ?? "?"} has no footprint or known template`,
    );
  }
  return resolved;
}

/** `own`, a frame in the parent's centred frame, carried through its pose. */
function withinParent(piece, own, getParent) {
  if (!getParent) {
    throw new Error(
      `piece ${piece.id ?? "?"} has parent_area_id but no getParent provided`,
    );
  }
  const parent = getParent(piece.parent_area_id);
  if (!parent) {
    throw new Error(
      `piece ${piece.id ?? "?"} references missing parent ${piece.parent_area_id}`,
    );
  }
  const outer = posed(parent, { x: 0, y: 0 });
  return {
    matrix: matmul(outer.matrix, own.matrix),
    place: (p) => outer.place(own.place(p)),
  };
}
