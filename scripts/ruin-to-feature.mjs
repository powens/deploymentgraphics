// Converts 40kdc corner-ruin pieces into `l-ruin` feature placements.
//
// The renderer's `lRuin` draws a fixed-chirality L (outer corner bottom-left,
// walls left + bottom) and `makeFeatures` only *rotates* a placement. Two of the
// six corner templates (balanced-right, corner-right) are the opposite
// chirality, so they map to the mirrored `l-ruin-mirror` variant — picked here
// by the sign of the resolved arm cross product (the same shoe / shoe-mirror
// trick used in area-to-building.mjs). Which pieces reach this converter -
// and that catwalks reach none - is decided in layout-to-placements.mjs.
//
// No ruin is emitted as a `-roof` variant. Those types still exist and still
// render (gw.yml hand-authors one), but nothing in the battlemaster corpus says
// a catwalk rests on a ruin, so this converter has no grounds to pick one.
// Upstream ships `pipes` as its own standalone composite - composite-03 and
// composite-30, whose only child is the pipes part - never as a child of a ruin
// composite, and measured over all 45 mission layouts no catwalk overlaps a
// ruin, touches one at each end, or shares a composite with one: the 90
// catwalk-to-nearest-ruin polygon gaps run 0.002in to 6.98in with no cluster at
// zero, and for 0 of 90 is the nearest ruin a sibling part. This used to be a
// centroid-distance threshold (`ROOF_DISTANCE`), which roofed 20 ruins sitting
// ~0.5in clear of their catwalk while skipping six that are flush against one.
// See the measurements pinned in ruin-to-feature.test.mjs.
//
// Each ruin reduces to three absolute reference points — the outer corner and
// the two arm ends — which a single fit (`featureFromRefs`) turns into a
// placement. Every corner-ruin piece carries a whole L footprint.

import { footprintPolygon, resolvePiece } from "./terrain-resolver.mjs";
import { featureRow } from "./emit-placement.mjs";
import { boundsCorners, distance, toDegrees } from "../src/geometry.ts";
import { placedFromPin } from "../src/placement.ts";

/** True for the 40kdc corner-ruin templates (l-ruin family). */
export const isRuinTemplate = (id) =>
  typeof id === "string" && id.startsWith("corner-");

/**
 * True when a footprint is an L: exactly three of its four bounding-box corners
 * are vertices (the open quadrant's corner is absent). Axis-aligned bars and
 * rotated rectangles fail this, and nothing else claims them, so they fail
 * the pull (see classifyPiece).
 */
export function isLFootprint(footprint) {
  const ring = footprintPolygon(footprint);
  const present = boundsCorners(ring).filter((c) =>
    ring.some((p) => distance(p, c) < 1e-6),
  );
  return present.length === 3;
}

/**
 * Ring indices of an L footprint's outer corner and two arm-end vertices. The
 * open quadrant's bbox corner is absent; the outer corner is its diagonal
 * opposite and the arm ends are the remaining two bbox corners. Returning ring
 * indices (rather than points) lets the caller read the matching absolute
 * vertices straight out of resolvePiece — which composes any parent transform.
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
 * corner and its two arm ends. The arm vectors are perpendicular; the sign of
 * their cross product is the L's chirality, which selects `l-ruin` (+1) vs
 * `l-ruin-mirror` (-1). The rotation maps the chosen variant's local wall
 * vectors onto the arms, and the outer corner is pinned to place it.
 *
 * @returns {object} an emitted `features` row (see emit-placement.mjs).
 */
export function featureFromRefs(Oa, A1, A2) {
  const u = { x: A1.x - Oa.x, y: A1.y - Oa.y }; // vertical-wall arm
  const v = { x: A2.x - Oa.x, y: A2.y - Oa.y }; // horizontal-wall arm
  const cross = u.x * v.y - u.y * v.x;
  const base = cross > 0 ? "l-ruin" : "l-ruin-mirror";

  const h = Math.hypot(u.x, u.y); // vertical-wall length
  const w = Math.hypot(v.x, v.y); // horizontal-wall length
  // The rotation R maps the variant's local wall vectors onto (u, v). Its
  // local horizontal wall vector is (sh, 0), sh = +1 (l-ruin) or -1 (mirror),
  // so R's first column points along the horizontal arm times sh — and since
  // the arms are perpendicular, R is a rotation and that first column fixes the
  // whole map. Only the direction matters, so the arm goes into atan2 unscaled.
  // The placement module takes it from here as an angle.
  const sh = cross > 0 ? 1 : -1;
  const rotDeg = toDegrees(Math.atan2(v.y * sh, v.x * sh));

  // The variant's own outer corner, pinned to the resolved one. Crossing the
  // placement seam here is what keeps the centre-pivot convention out of this
  // file: the fit ends at "this local point lands there, at this rotation".
  const Of = base === "l-ruin" ? { x: 0, y: h } : { x: w, y: h };
  return featureRow(
    placedFromPin(base, { width: w, height: h }, rotDeg, Of, Oa),
    "green",
  );
}

/** Outer corner + arm ends of a single whole-L corner-ruin piece. */
function lPieceRefs(piece, lookupFootprint, getParent) {
  const footprint = piece.footprint ?? lookupFootprint(piece.template);
  const ring = footprintPolygon(footprint);
  const { Oidx, armIdx } = lRefIndices(ring);
  // Same vertices read from resolvePiece, which applies this piece's
  // mirror/rotation and any parent_area_id transform.
  const resolved = resolvePiece(piece, lookupFootprint, getParent);
  return { Oa: resolved[Oidx], A1: resolved[armIdx[0]], A2: resolved[armIdx[1]] };
}

/** Build a placement for a single whole-L corner-ruin piece. */
export function ruinFeaturePlacement(piece, lookupFootprint, getParent) {
  const { Oa, A1, A2 } = lPieceRefs(piece, lookupFootprint, getParent);
  return featureFromRefs(Oa, A1, A2);
}
