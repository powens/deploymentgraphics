// Converts 40kdc corner-ruin pieces into `l-ruin` feature placements.
//
// The renderer's `lRuin` draws a fixed-chirality L (outer corner bottom-left,
// walls left + bottom) and features are only rotated, never mirrored. The
// opposite-chirality templates (balanced-right, corner-right) therefore map to
// `l-ruin-mirror`, picked by the sign of the resolved arm cross product.
//
// No ruin gets a roof: upstream never places a catwalk on a ruin (the 90
// catwalk-to-nearest-ruin gaps run 0.002-6.98in with no cluster at zero, and
// none shares a composite); see ruin-to-feature.test.mjs.

import { footprintPolygon, pieceFootprint } from "./terrain-resolver.mjs";
import { featureRow } from "./emit-placement.mjs";
import { boundsCorners, cross, distance, toDegrees } from "../src/geometry.ts";
import { placedFromPin } from "../src/placement.ts";

/** True for the 40kdc corner-ruin templates (l-ruin family). */
export const isRuinTemplate = (id) =>
  typeof id === "string" && id.startsWith("corner-");

/**
 * True when a footprint is an L: exactly three of its four bounding-box corners
 * are vertices (the open quadrant's corner is absent).
 */
export function isLFootprint(footprint) {
  const ring = footprintPolygon(footprint);
  const present = boundsCorners(ring).filter((c) =>
    ring.some((p) => distance(p, c) < 1e-6),
  );
  return present.length === 3;
}

/**
 * Ring indices of an L footprint's outer corner (diagonal from the open
 * quadrant) and two arm ends. Indices, not points, so the caller can read the
 * matching vertices from the resolved (parent-composed) ring.
 */
function lRefIndices(ring) {
  // boundsCorners is TL, TR, BR, BL, so index + 2 is the diagonal.
  const idx = boundsCorners(ring).map((c) =>
    ring.findIndex((p) => distance(p, c) < 1e-6),
  );
  const openIdx = idx.findIndex((i) => i === -1);
  if (openIdx === -1 || idx.filter((i) => i >= 0).length !== 3) {
    throw new Error("ruin footprint is not an L (expected 3 of 4 bbox corners)");
  }
  return {
    Oidx: idx[(openIdx + 2) % 4],
    armIdx: [0, 1, 2, 3]
      .filter((i) => i !== openIdx && i !== (openIdx + 2) % 4)
      .map((i) => idx[i]),
  };
}

/**
 * Fit an l-ruin placement to three absolute reference points: the L's outer
 * corner and its two arm ends. The sign of the arms' cross product selects
 * `l-ruin` (+) vs `l-ruin-mirror` (-).
 *
 * @returns {object} an emitted `features` row (see emit-placement.mjs).
 */
export function featureFromRefs(Oa, A1, A2) {
  const v = { x: A2.x - Oa.x, y: A2.y - Oa.y }; // horizontal-wall arm
  const chirality = cross(Oa, A1, A2);
  const base = chirality > 0 ? "l-ruin" : "l-ruin-mirror";

  const h = distance(Oa, A1); // vertical-wall length
  const w = distance(Oa, A2); // horizontal-wall length
  // The variant's local horizontal wall is (sh, 0), sh = +1 (l-ruin) or -1
  // (mirror), so the rotation is the angle of the horizontal arm times sh; the
  // arms are perpendicular, so that fixes the whole map.
  const sh = chirality > 0 ? 1 : -1;
  const rotDeg = toDegrees(Math.atan2(v.y * sh, v.x * sh));

  // Pin the variant's local outer corner to the resolved one.
  const Of = base === "l-ruin" ? { x: 0, y: h } : { x: w, y: h };
  return featureRow(
    placedFromPin(base, { width: w, height: h }, rotDeg, Of, Oa),
    "green",
  );
}

/** Outer corner + arm ends of a single whole-L corner-ruin piece. */
function lPieceRefs(piece, layout) {
  const ring = footprintPolygon(pieceFootprint(piece, layout.footprintOf));
  const { Oidx, armIdx } = lRefIndices(ring);
  const resolved = layout.resolve(piece);
  return { Oa: resolved[Oidx], A1: resolved[armIdx[0]], A2: resolved[armIdx[1]] };
}

/**
 * Build a placement for a single whole-L corner-ruin piece.
 *
 * @param {object} piece - a whole-L corner-ruin piece.
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 */
export function ruinFeaturePlacement(piece, layout) {
  const { Oa, A1, A2 } = lPieceRefs(piece, layout);
  return featureFromRefs(Oa, A1, A2);
}
