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

import { resolvePiece } from "./terrain-resolver.mjs";
import { featureRow } from "./emit-placement.mjs";
import { centroid, distance, toDegrees } from "../src/geometry.ts";
import { placedFromPin } from "../src/placement.ts";

// 40kdc template id -> feature type drawn by src/features.ts.
const RECT_FEATURES = {
  generator: "generator",
  gantry: "gantry",
};

// Feature type -> theme.yml palette key. Both sit on top of the grey buildings,
// so both take a hue rather than a value: generators an industrial teal,
// gantries indigo. Gantries were gunmetal, which is the buildings' own hue a
// few steps darker and barely separated from them.
const RECT_FEATURE_COLORS = {
  generator: "teal",
  gantry: "indigo",
};

/** True for a 40kdc template that maps to a rectangle feature. */
export const isRectFeatureTemplate = (id) =>
  Object.prototype.hasOwnProperty.call(RECT_FEATURES, id);

/** Fit a feature placement to a resolved rectangle (perimeter-ordered corners). */
export function rectFeaturePlacement(piece, lookupFootprint, getParent) {
  const r = resolvePiece(piece, lookupFootprint, getParent);
  const u = { x: r[1].x - r[0].x, y: r[1].y - r[0].y }; // first edge
  const size = { width: distance(r[0], r[1]), height: distance(r[1], r[2]) };
  const rotDeg = toDegrees(Math.atan2(u.y, u.x));
  const type = RECT_FEATURES[piece.template];
  // The pinned point is the box centre, which the rectangle's centroid gives
  // directly — the degenerate case of the same fit ruin-to-feature.mjs uses.
  const centre = { x: size.width / 2, y: size.height / 2 };
  return featureRow(
    placedFromPin(type, size, rotDeg, centre, centroid(r)),
    RECT_FEATURE_COLORS[type],
  );
}
