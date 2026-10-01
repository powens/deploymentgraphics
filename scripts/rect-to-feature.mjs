// Converts the Battlemaster generator and tower parts into feature placements. The piece
// resolves to a rectangle in perimeter order; a box centred on its centroid,
// sized to its side lengths and rotated to its first edge reproduces it. A
// rectangle is reflection-symmetric, so no mirror variant is needed (the
// asymmetric generator interior may flip cosmetically).

import { featureRow } from "./emit-placement.mjs";
import { centroid, distance, toDegrees } from "../src/geometry.ts";
import { placedFromPin } from "../src/placement.ts";

// Battlemaster part -> feature type drawn by src/features.ts.
const RECT_FEATURES = {
  generator: "generator",
  tower: "gantry",
};

// Feature type -> theme.yml palette key. Both sit on grey buildings, so both
// take a distinct hue; a grey would barely separate from them.
const RECT_FEATURE_COLORS = {
  generator: "teal",
  gantry: "indigo",
};

/** True for a Battlemaster part drawn as a rectangle feature. */
export const isRectFeaturePart = (part) => Object.hasOwn(RECT_FEATURES, part);

/**
 * Fit a feature placement to a resolved rectangle (perimeter-ordered corners).
 *
 * @param {object} piece - a generator or tower piece.
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 */
export function rectFeaturePlacement(piece, layout) {
  const r = layout.resolve(piece);
  const u = { x: r[1].x - r[0].x, y: r[1].y - r[0].y }; // first edge
  const size = { width: distance(r[0], r[1]), height: distance(r[1], r[2]) };
  const rotDeg = toDegrees(Math.atan2(u.y, u.x));
  const type = RECT_FEATURES[piece.part];
  // Pin the box centre to the rectangle's centroid.
  const centre = { x: size.width / 2, y: size.height / 2 };
  return featureRow(
    placedFromPin(type, size, rotDeg, centre, centroid(r)),
    RECT_FEATURE_COLORS[type],
  );
}
