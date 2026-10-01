// Classifies each piece of a 40kdc layout and dispatches it to its converter.

import { areaBuildingPlacement } from "./area-to-building.mjs";
import { isRuinPart, ruinFeaturePlacement } from "./ruin-to-feature.mjs";
import { isRectFeaturePart, rectFeaturePlacement } from "./rect-to-feature.mjs";
import {
  featureBuildingPlacement,
  isFeatureBuildingPart,
} from "./feature-to-building.mjs";

/**
 * The kinds a layout piece can have; every piece matches exactly one row
 * (`is_objective` is orthogonal and handled by objective-icons.mjs). A feature
 * is claimed by its Battlemaster `part`; parts the pipeline does not draw are
 * dropped in battlemaster-normalize.mjs and never reach here.
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
    /** barrier part -> pipe/barricade building template placement. */
    kind: "feature-building",
    claims: (piece) => isFeatureBuildingPart(piece.part),
    convert: featureBuildingPlacement,
    bucket: "templates",
  },
  {
    /** L-ruin part -> `l-ruin` feature. */
    kind: "ruin-feature",
    claims: (piece) => isRuinPart(piece.part),
    convert: ruinFeaturePlacement,
    bucket: "features",
  },
  {
    /** generator/tower part -> rectangle feature. */
    kind: "rect-feature",
    claims: (piece) => isRectFeaturePart(piece.part),
    convert: rectFeaturePlacement,
    bucket: "features",
  },
].map(Object.freeze));

/**
 * Buckets in combined.yml entry order. Checked at load below: a row naming an
 * unknown bucket would otherwise have its pieces silently dropped.
 */
const BUCKETS = ["templates", "features"];

for (const kind of PIECE_KINDS) {
  if (!BUCKETS.includes(kind.bucket)) {
    throw new Error(
      `PIECE_KINDS row "${kind.kind}" converts into bucket ` +
        `"${kind.bucket}", which is not one of ${BUCKETS.join(", ")}`,
    );
  }
}

/**
 * The single kind of one layout piece.
 *
 * @param {object} piece - a normalized layout piece.
 * @returns {object} the matching PIECE_KINDS row.
 * @throws if two rows would claim the same piece, or if none does.
 */
export function classifyPiece(piece) {
  const matched = PIECE_KINDS.filter((row) => row.claims(piece));
  const named = `piece ${piece.id ?? "?"} (${piece.piece_type}/${piece.part ?? piece.template})`;
  if (matched.length > 1) {
    throw new Error(
      `${named} matches more than one kind: ${matched.map((r) => r.kind).join(", ")}`,
    );
  }
  if (matched.length === 0) {
    // An upstream part this pipeline has not been taught: fail the pull.
    throw new Error(
      `${named} matches no converter; teach one to claim its part or drop it ` +
        `in battlemaster-normalize.mjs's PART_TO_TEMPLATE`,
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
    const kind = classifyPiece(piece);
    rows.get(kind).push(kind.convert(piece, layout, gwTemplates));
  }

  const bucket = (name) =>
    PIECE_KINDS.filter((kind) => kind.bucket === name).flatMap((kind) =>
      rows.get(kind),
    );
  return Object.fromEntries(BUCKETS.map((name) => [name, bucket(name)]));
}
