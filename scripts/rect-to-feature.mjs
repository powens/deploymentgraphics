// Converts 40kdc rectangle feature pieces (generators, gantries) into
// `generator` / `gantry` feature placements.
//
// A generator or gantry piece resolves (via resolvePiece) to a proper rectangle
// in perimeter order. The feature renderer places a box with
// `translate(x, y) . rotate(rotation, w/2, h/2)`, so a placement centred on the
// rectangle's centroid, sized to its two side lengths and rotated to its first
// edge reproduces the resolved outline exactly. A rectangle outline is
// reflection-symmetric, so centring covers both mirror parities without a
// mirror variant (the asymmetric generator interior may flip cosmetically).
//
// Parallels scripts/ruin-to-feature.mjs and scripts/area-to-building.mjs.

import { resolvePiece, centroid } from "./terrain-resolver.mjs";
import { round } from "./area-to-building.mjs";

// 40kdc template id -> feature type drawn by src/features.ts.
const RECT_FEATURES = {
  generator: "generator",
  gantry: "gantry",
};

/** True for a 40kdc template that maps to a rectangle feature. */
export const isRectFeatureTemplate = (id) =>
  Object.prototype.hasOwnProperty.call(RECT_FEATURES, id);

/** Fit a feature placement to a resolved rectangle (perimeter-ordered corners). */
export function rectFeaturePlacement(piece, lookupFootprint, getParent) {
  const r = resolvePiece(piece, lookupFootprint, getParent);
  const u = { x: r[1].x - r[0].x, y: r[1].y - r[0].y }; // first edge
  const width = Math.hypot(u.x, u.y);
  const height = Math.hypot(r[2].x - r[1].x, r[2].y - r[1].y);
  const c = centroid(r);
  const rotDeg = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  return {
    type: RECT_FEATURES[piece.template],
    label: piece.template,
    x: round(c.x - width / 2),
    y: round(c.y - height / 2),
    width: round(width),
    height: round(height),
    rotation: round(((rotDeg % 360) + 360) % 360),
    color: "gunmetal",
    mirror: false,
  };
}

/**
 * Resolve every generator/gantry piece in a layout to a feature placement.
 * Returns the placements plus the set of piece ids the caller should not also
 * emit as area_terrain.
 *
 * @param {object} layout - a 40kdc layout ({ pieces }).
 * @param {(id: string) => object} lookupFootprint
 * @param {(id: string) => object} getParent
 * @returns {{ features: object[], consumedIds: Set<string> }}
 */
export function rectFeatures(layout, lookupFootprint, getParent) {
  const features = [];
  const consumedIds = new Set();
  for (const piece of layout.pieces) {
    if (!isRectFeatureTemplate(piece.template)) continue;
    features.push(rectFeaturePlacement(piece, lookupFootprint, getParent));
    consumedIds.add(piece.id);
  }
  return { features, consumedIds };
}
