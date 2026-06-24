// Converts 40kdc corner-ruin pieces into `l-ruin` feature placements.
//
// The renderer's `lRuin` draws a fixed-chirality L (outer corner bottom-left,
// walls left + bottom) and `makeFeatures` only *rotates* a placement. Two of the
// six corner templates (balanced-right, corner-right) are the opposite
// chirality, so they map to the mirrored `l-ruin-mirror` variant — picked here
// by the sign of the resolved arm cross product (the same shoe / shoe-mirror
// trick used in area-to-building.mjs). A ruin with a catwalk on top uses the
// `-roof` variant; catwalk pieces themselves are dropped.
//
// Each ruin reduces to three absolute reference points — the outer corner and
// the two arm ends — which a single fit (`featureFromRefs`) turns into a
// placement. Every corner-ruin piece carries a whole L footprint.

import { footprintPolygon, centroid, resolvePiece } from "./terrain-resolver.mjs";
import { round } from "./area-to-building.mjs";

/** True for the 40kdc corner-ruin templates (l-ruin family). */
export const isRuinTemplate = (id) =>
  typeof id === "string" && id.startsWith("corner-");

const bbox = (ring) => ({
  minX: Math.min(...ring.map((p) => p.x)),
  maxX: Math.max(...ring.map((p) => p.x)),
  minY: Math.min(...ring.map((p) => p.y)),
  maxY: Math.max(...ring.map((p) => p.y)),
});

/**
 * True when a footprint is an L: exactly three of its four bounding-box corners
 * are vertices (the open quadrant's corner is absent). Axis-aligned bars and
 * rotated rectangles fail this and stay as area_terrain.
 */
export function isLFootprint(footprint) {
  const ring = footprintPolygon(footprint);
  const { minX, maxX, minY, maxY } = bbox(ring);
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const present = corners.filter((c) =>
    ring.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 1e-6),
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
  const { minX, maxX, minY, maxY } = bbox(ring);
  // Bounding-box corners in TL, TR, BR, BL order so index+2 is the diagonal.
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const idx = corners.map((c) =>
    ring.findIndex((p) => Math.hypot(p.x - c.x, p.y - c.y) < 1e-6),
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

const ROOF = {
  "l-ruin": "l-ruin-roof",
  "l-ruin-mirror": "l-ruin-roof-mirror",
};

/**
 * Fit an l-ruin placement to three absolute reference points: the L's outer
 * corner and its two arm ends. The arm vectors are perpendicular; the sign of
 * their cross product is the L's chirality, which selects `l-ruin` (+1) vs
 * `l-ruin-mirror` (-1). The rotation maps the chosen variant's local wall
 * vectors onto the arms, and the outer corner is pinned to place it.
 *
 * @returns {{type, x, y, width, height, rotation, color, label, mirror: false}}
 */
export function featureFromRefs(Oa, A1, A2, roofed) {
  const u = { x: A1.x - Oa.x, y: A1.y - Oa.y }; // vertical-wall arm
  const v = { x: A2.x - Oa.x, y: A2.y - Oa.y }; // horizontal-wall arm
  const cross = u.x * v.y - u.y * v.x;
  const base = cross > 0 ? "l-ruin" : "l-ruin-mirror";

  const h = Math.hypot(u.x, u.y); // vertical-wall length
  const w = Math.hypot(v.x, v.y); // horizontal-wall length
  const uh = { x: u.x / h, y: u.y / h };
  const vh = { x: v.x / w, y: v.y / w };

  // Rotation R mapping the variant's local wall vectors onto (u, v). Local
  // vertical wall vec = (0,-1); horizontal = (sh,0) with sh = +1 (l-ruin) or
  // -1 (mirror). R = [uh vh] * [sv sh]^T.
  const sh = cross > 0 ? 1 : -1;
  const R00 = vh.x * sh;
  const R01 = -uh.x;
  const R10 = vh.y * sh;
  const R11 = -uh.y;
  const rotDeg = (Math.atan2(R10, R00) * 180) / Math.PI;

  // Place the outer corner: world(O_f) = R*(O_f - ctr) + ctr + (x, y) = Oa.
  const ctr = { x: w / 2, y: h / 2 };
  const Of = base === "l-ruin" ? { x: 0, y: h } : { x: w, y: h };
  const dx = Of.x - ctr.x;
  const dy = Of.y - ctr.y;
  const rx = R00 * dx + R01 * dy;
  const ry = R10 * dx + R11 * dy;
  const x = Oa.x - rx - ctr.x;
  const y = Oa.y - ry - ctr.y;

  const rotation = ((rotDeg % 360) + 360) % 360;
  const type = roofed ? ROOF[base] : base;
  return {
    type,
    label: "ruin",
    x: round(x),
    y: round(y),
    width: round(w),
    height: round(h),
    rotation: round(rotation),
    color: "green",
    mirror: false,
  };
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
export function ruinFeaturePlacement(piece, lookupFootprint, getParent, roofed) {
  const { Oa, A1, A2 } = lPieceRefs(piece, lookupFootprint, getParent);
  return featureFromRefs(Oa, A1, A2, roofed);
}

// A catwalk roofs the ruin whose centre it lands nearest, within this distance
// (inches). The roofed pairs sit ~1.5-2.2in apart; the nearest free-standing
// catwalk is ~4in away, so the threshold separates them cleanly.
const ROOF_DISTANCE = 3;

/**
 * Resolve every whole-L corner-ruin in a layout to an `l-ruin` feature
 * placement, applying the `-roof` variant where a catwalk sits on the ruin.
 * Catwalk pieces are consumed (dropped). Returns the placements plus the set of
 * piece ids the caller should not also emit as area_terrain (ruin pieces and
 * catwalks).
 *
 * @param {object} layout - a 40kdc layout ({ pieces }).
 * @param {(id: string) => object} lookupFootprint
 * @param {(id: string) => object} getParent
 * @returns {{ features: object[], consumedIds: Set<string> }}
 */
export function ruinFeatures(layout, lookupFootprint, getParent) {
  const consumedIds = new Set();
  const ruins = []; // { ids, anchor, make(roofed) }

  for (const p of layout.pieces) {
    if (!isRuinTemplate(p.template)) continue;
    const footprint = p.footprint ?? lookupFootprint(p.template);
    // Only whole-L corner footprints become ruins; any other corner piece
    // falls through to area_terrain.
    if (!isLFootprint(footprint)) continue;
    const resolved = resolvePiece(p, lookupFootprint, getParent);
    const { Oa, A1, A2 } = lPieceRefs(p, lookupFootprint, getParent);
    ruins.push({
      ids: [p.id],
      anchor: centroid(resolved),
      make: (roofed) => featureFromRefs(Oa, A1, A2, roofed),
    });
  }

  const roofed = new Set();
  for (const p of layout.pieces) {
    if (p.template !== "catwalk") continue;
    consumedIds.add(p.id);
    const cc = centroid(resolvePiece(p, lookupFootprint, getParent));
    let best = -1;
    let bd = ROOF_DISTANCE;
    ruins.forEach((r, i) => {
      const d = Math.hypot(cc.x - r.anchor.x, cc.y - r.anchor.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) roofed.add(best);
  }

  const features = ruins.map((r, i) => {
    r.ids.forEach((id) => consumedIds.add(id));
    return r.make(roofed.has(i));
  });
  return { features, consumedIds };
}
