// Classifies each piece of a 40kdc layout and dispatches it to its converter.

import { areaBuildingPlacement } from "./area-to-building.mjs";
import {
  isLFootprint,
  isRuinTemplate,
  ruinFeaturePlacement,
} from "./ruin-to-feature.mjs";
import {
  isRectFeatureTemplate,
  rectFeaturePlacement,
} from "./rect-to-feature.mjs";
import {
  featureBuildingPlacement,
  isFeatureBuildingTemplate,
} from "./feature-to-building.mjs";
import { pieceFootprint } from "./terrain-resolver.mjs";

/**
 * The kinds a layout piece can have; every piece matches exactly one row
 * (`is_objective` is orthogonal and handled by objective-icons.mjs).
 *
 * Row order is output order within each bucket, which keeps combined.yml
 * stable. Converters take `(piece, layout, gwTemplates)`.
 */
export const PIECE_KINDS = Object.freeze([
  {
    /** `area` piece -> gw building template placement. */
    kind: "area-building",
    claims: (piece) => piece.piece_type === "area",
    convert: areaBuildingPlacement,
    bucket: "templates",
  },
  {
    /** pipe/barricade -> building template placement. */
    kind: "feature-building",
    claims: (piece) => isFeatureBuildingTemplate(piece.template),
    convert: featureBuildingPlacement,
    bucket: "templates",
  },
  {
    /** whole-L corner-ruin piece -> `l-ruin` feature. */
    kind: "ruin-feature",
    // Any non-L corner piece is unclaimed, so `classifyPiece` throws on it.
    claims: (piece, layout) =>
      isRuinTemplate(piece.template) &&
      isLFootprint(pieceFootprint(piece, layout.footprintOf)),
    convert: ruinFeaturePlacement,
    bucket: "features",
  },
  {
    /** generator/gantry -> rectangle feature. */
    kind: "rect-feature",
    claims: (piece) => isRectFeatureTemplate(piece.template),
    convert: rectFeaturePlacement,
    bucket: "features",
  },
  {
    /**
     * Catwalks are dropped: the parent area already becomes a building covering
     * upstream's 6x1in `pipes` part. The 7x2in legacy `catwalk` template
     * overhangs its 6x2in parent by 0.5in each end; that is an artifact of the
     * template (see the `pipes` note on PART_TO_TEMPLATE in
     * battlemaster-normalize.mjs), not upstream ground.
     */
    kind: "dropped",
    claims: (piece) => piece.template === "catwalk",
  },
].map(Object.freeze));

/**
 * Buckets in combined.yml entry order. Checked at load below: a row naming an
 * unknown bucket would otherwise have its pieces silently dropped.
 */
const BUCKETS = ["templates", "features"];

for (const kind of PIECE_KINDS) {
  if (kind.convert && !BUCKETS.includes(kind.bucket)) {
    throw new Error(
      `PIECE_KINDS row "${kind.kind}" converts into bucket ` +
        `"${kind.bucket}", which is not one of ${BUCKETS.join(", ")}`,
    );
  }
  if (!kind.convert && kind.bucket !== undefined) {
    throw new Error(
      `PIECE_KINDS row "${kind.kind}" names a bucket but has no converter`,
    );
  }
}

/**
 * The single kind of one layout piece.
 *
 * @param {object} piece - a 40kdc layout piece.
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs,
 *   read for the footprint lookup that tests a corner piece for the L shape.
 * @returns {object} the matching PIECE_KINDS row.
 * @throws if two rows would claim the same piece, or if none does.
 */
export function classifyPiece(piece, layout) {
  const matched = PIECE_KINDS.filter((row) => row.claims(piece, layout));
  if (matched.length > 1) {
    throw new Error(
      `piece ${piece.id ?? "?"} (${piece.piece_type}/${piece.template}) ` +
        `matches more than one kind: ${matched.map((r) => r.kind).join(", ")}`,
    );
  }
  if (matched.length === 0) {
    // An upstream shape this pipeline has not been taught: fail the pull.
    throw new Error(
      `piece ${piece.id ?? "?"} (${piece.piece_type}/${piece.template}) ` +
        `matches no converter; teach one to claim it or add it to PIECE_KINDS ` +
        `as explicitly dropped`,
    );
  }
  return matched[0];
}

/**
 * Convert every piece of one layout into the rows a combined.yml entry holds.
 *
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @param {object} gwTemplates - the hand-authored building templates, read for
 *   the **Template box** that sizes `area` and pipe/barricade placements.
 * @returns {{ templates: object[], features: object[] }}
 */
export function layoutPlacements(layout, gwTemplates) {
  const rows = new Map(PIECE_KINDS.map((kind) => [kind, []]));

  for (const piece of layout.pieces) {
    const kind = classifyPiece(piece, layout);
    if (!kind.convert) continue;
    rows.get(kind).push(kind.convert(piece, layout, gwTemplates));
  }

  const bucket = (name) =>
    PIECE_KINDS.filter((kind) => kind.bucket === name).flatMap((kind) =>
      rows.get(kind),
    );
  return Object.fromEntries(BUCKETS.map((name) => [name, bucket(name)]));
}
