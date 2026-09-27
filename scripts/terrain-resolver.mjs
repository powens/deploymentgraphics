// Owns the 40kdc piece pose (see Piece pose in CONTEXT.md), and resolves a
// piece to an absolute board polygon.
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
 * A piece's own frame, ignoring any parent: `place` maps a footprint-local
 * point to where the piece's pose puts it, and `matrix` is its linear part.
 *
 * @param {object} piece - `position`, optional `rotation_degrees`, optional
 *   `mirror`.
 * @param {object} footprint - the footprint the piece draws from.
 */
export function pieceFrame(piece, footprint) {
  return posed(piece, centroid(footprintPolygon(footprint)));
}

/**
 * The footprint a piece draws from - its own inline one, else its template's -
 * or `undefined` when it has neither. Prefer {@link pieceFootprint} unless
 * absence is a case you handle.
 *
 * @param {object} piece - `footprint` or `template`.
 * @param {(id: string) => object | null | undefined} lookupFootprint
 */
export function pieceFootprintIfAny(piece, lookupFootprint) {
  return piece.footprint ?? lookupFootprint(piece.template);
}

/**
 * Like {@link pieceFootprintIfAny}, but throws when the piece has neither.
 *
 * @param {object} piece - `footprint` or `template`.
 * @param {(id: string) => object | null | undefined} lookupFootprint
 */
export function pieceFootprint(piece, lookupFootprint) {
  const footprint = pieceFootprintIfAny(piece, lookupFootprint);
  if (!footprint) {
    throw new Error(
      `piece ${piece.id ?? "?"} has no footprint or known template`,
    );
  }
  return footprint;
}

/**
 * Resolve a piece to absolute board-inch vertices.
 * @param {object} piece - `position`, optional `rotation_degrees`, optional
 *   `mirror` ("horizontal"|"vertical"), optional `parent_area_id`, and either
 *   `footprint` or `template`.
 * @param {(id: string) => object | null | undefined} lookupFootprint
 * @param {(id: string) => object | undefined} [getParent] - required only for
 *   pieces carrying a `parent_area_id`.
 */
export function resolvePiece(piece, lookupFootprint, getParent) {
  const footprint = pieceFootprint(piece, lookupFootprint);
  const local = footprintPolygon(footprint).map(pieceFrame(piece, footprint).place);
  if (!piece.parent_area_id) return local;
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
  // `local` is in the parent's centred frame; carry it through the parent's
  // pose.
  return local.map(posed(parent, { x: 0, y: 0 }).place);
}
