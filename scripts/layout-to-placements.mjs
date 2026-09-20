// The one walk over a 40kdc layout's pieces: classify each piece, then hand it
// to the converter that owns that kind.
//
// Classification used to be spread across three collectors that each filtered
// `layout.pieces` themselves and handed back a `consumedIds` set for a fourth
// walk to skip. Nothing made those filters disjoint, so a piece could be
// claimed twice; PIECE_KINDS gives every piece exactly one kind and throws if
// two rows would claim it, which makes a double emit unrepresentable.
//
// The per-piece converters (area-to-building, ruin-to-feature, rect-to-feature,
// feature-to-building) stay where they are - this module only decides which one
// each piece goes to.

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

/**
 * The kinds a layout piece can have. Every piece has exactly one.
 *
 * "Exactly one" is about *this* walk, not about everything a layout emits:
 * `is_objective` is an orthogonal per-piece attribute, and an objective piece
 * is both a building and a marker. `scripts/objective-icons.mjs` walks the
 * same pieces for it - see the note in scripts/convert-40kdc-terrain.mjs.
 *
 * One row per kind, carrying everything that kind decides: which pieces it
 * claims, which converter draws them, and which bucket of the emitted entry
 * they land in. The claims were a separate table from the dispatch, and the
 * split was a failure mode of its own - a kind classified but not dispatched
 * fell through to a `default: throw`, which only existed because the two lists
 * could drift. Merging them removes that case and costs nothing.
 *
 * Row order is the output order: `layoutPlacements` concatenates each bucket's
 * rows in the order the kinds appear here, so the generated file keeps its
 * established layout (areas before pipes/barricades, ruins before
 * generators/gantries) rather than the interleaving of the source piece list.
 *
 * Every converter takes `(piece, layout, gwTemplates)` and reads the lookups it
 * needs off the layout, which is what `scripts/terrain-corpus.mjs` attached
 * them for. A converter that wants fewer arguments simply declares fewer.
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
    // Only a whole-L corner footprint becomes a ruin; any other corner piece
    // is unclaimed, and `classifyPiece` throws on it.
    claims: (piece, layout) =>
      isRuinTemplate(piece.template) &&
      isLFootprint(piece.footprint ?? layout.footprintOf(piece.template)),
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
     * Catwalks are consumed and not emitted: upstream models them as
     * standalone composites, and the parent area still becomes a building that
     * already covers upstream's 6x1in `pipes` part. The legacy `catwalk`
     * template that part is normalized onto is 7x2in, so the resolved child
     * does overhang its 6x2in parent by 0.5in at each end (measured: catwalk y
     * 4.5015-11.5015 against area y 5.000-11.000). That overhang is an artifact
     * of the oversized legacy template rather than ground upstream draws - see
     * the `pipes` note on PART_TO_TEMPLATE in battlemaster-normalize.mjs - and
     * is accepted, not emitted.
     *
     * No `convert` and no `bucket`: that is what "dropped" means here.
     */
    kind: "dropped",
    claims: (piece) => piece.template === "catwalk",
  },
]);

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
    // There used to be an `area_terrain` fallback here, drawing an unclaimed
    // piece as a translucent zone. Every piece in the corpus is claimed by a
    // converter (720 area-buildings, 720 ruins, 270 feature-buildings, 180
    // rect-features, 90 dropped catwalks), so the fallback emitted nothing and
    // the whole draw path behind it was dead — see #182. An unclaimed piece is
    // now an upstream shape this pipeline has not been taught, which should
    // fail the pull rather than silently become a grey blob.
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
  return { templates: bucket("templates"), features: bucket("features") };
}
