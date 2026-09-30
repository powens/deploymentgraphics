// Converts the Battlemaster L-ruin parts into `l-ruin` feature placements.
//
// The renderer's `lRuin` draws a fixed-chirality L (outer corner bottom-left,
// walls left + bottom) and features are only rotated, never mirrored, so each
// part's hand picks `l-ruin` or `l-ruin-mirror`.
//
// No ruin gets a roof: upstream never places its catwalk (`pipes`) on a ruin;
// see ruin-to-feature.test.mjs.

import { footprintPolygon, pieceFootprint } from "./terrain-resolver.mjs";
import { featureRow } from "./emit-placement.mjs";
import { boundsCorners, cross, distance, toDegrees } from "../src/geometry.ts";
import { placedFromPin } from "../src/placement.ts";

/**
 * The l-ruin variant each whole-L part is drawn with: its hand. Upstream's
 * data does not encode chirality, so these were measured against the pre-pull
 * corpus (see PART_TO_TEMPLATE in battlemaster-normalize.mjs), and
 * `ruinFeaturePlacement` throws on a piece that resolves with the other hand.
 * `small-l` and `small-l-flip` are the two hands of one model; `corner` has
 * equal arms, so its hand is cosmetic.
 */
const RUIN_HAND = {
  ab: "l-ruin-mirror",
  cd: "l-ruin",
  co: "l-ruin",
  corner: "l-ruin-mirror",
  ef: "l-ruin-mirror",
  gh: "l-ruin-mirror",
  "small-l": "l-ruin-mirror",
  "small-l-flip": "l-ruin",
};

/** True for a Battlemaster part drawn as an l-ruin. */
export const isRuinPart = (part) => Object.hasOwn(RUIN_HAND, part);

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
 * corner and its two arm ends, whose cross product is positive for `l-ruin`
 * and negative for `l-ruin-mirror`.
 *
 * @returns {object} an emitted `features` row (see emit-placement.mjs).
 */
function featureFromRefs(base, Oa, A1, A2) {
  const v = { x: A2.x - Oa.x, y: A2.y - Oa.y }; // horizontal-wall arm
  const h = distance(Oa, A1); // vertical-wall length
  const w = distance(Oa, A2); // horizontal-wall length
  // The variant's local horizontal wall is (sh, 0), sh = +1 (l-ruin) or -1
  // (mirror), so the rotation is the angle of the horizontal arm times sh; the
  // arms are perpendicular, so that fixes the whole map.
  const sh = base === "l-ruin" ? 1 : -1;
  const rotDeg = toDegrees(Math.atan2(v.y * sh, v.x * sh));

  // Pin the variant's local outer corner to the resolved one.
  const Of = base === "l-ruin" ? { x: 0, y: h } : { x: w, y: h };
  return featureRow(
    placedFromPin(base, { width: w, height: h }, rotDeg, Of, Oa),
    "green",
  );
}

/** Outer corner + arm ends of a single whole-L ruin piece. */
function lPieceRefs(piece, layout) {
  const ring = footprintPolygon(pieceFootprint(piece, layout.footprintOf));
  const { Oidx, armIdx } = lRefIndices(ring);
  const resolved = layout.resolve(piece);
  return { Oa: resolved[Oidx], A1: resolved[armIdx[0]], A2: resolved[armIdx[1]] };
}

/**
 * Build a placement for a single whole-L ruin piece.
 *
 * @param {object} piece - a piece whose `part` is an L-ruin part.
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @throws if the piece resolves with the other hand from its part's.
 */
export function ruinFeaturePlacement(piece, layout) {
  const base = RUIN_HAND[piece.part];
  if (!base) {
    throw new Error(`piece ${piece.id ?? "?"}: part ${piece.part} is not an L-ruin part`);
  }
  const { Oa, A1, A2 } = lPieceRefs(piece, layout);
  const resolved = cross(Oa, A1, A2) > 0 ? "l-ruin" : "l-ruin-mirror";
  if (resolved !== base) {
    throw new Error(
      `piece ${piece.id ?? "?"}: part ${piece.part} is drawn as ${base} ` +
        `but resolves as ${resolved}`,
    );
  }
  return featureFromRefs(base, Oa, A1, A2);
}
