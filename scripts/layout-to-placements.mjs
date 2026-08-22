// The one walk over a 40kdc layout's pieces: classify each piece, then dispatch
// to the converter that owns that kind.
//
// Classification used to be spread across three collectors that each filtered
// `layout.pieces` themselves and handed back a `consumedIds` set for a fourth
// walk to skip. Nothing made those filters disjoint, so a piece could be
// claimed twice; `classifyPiece` gives every piece exactly one kind and throws
// if two converters would claim it, which makes a double emit unrepresentable.
//
// The per-piece converters (area-to-building, ruin-to-feature, rect-to-feature,
// feature-to-building) stay where they are - this module only decides which one
// each piece goes to.

import { areaBuildingPlacement, round } from "./area-to-building.mjs";
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

/** The kinds a layout piece can have. Every piece has exactly one. */
export const PIECE_KINDS = Object.freeze({
  /** `area` piece -> gw building template placement. */
  areaBuilding: "area-building",
  /** whole-L corner-ruin piece -> `l-ruin` feature. */
  ruinFeature: "ruin-feature",
  /** generator/gantry -> rectangle feature. */
  rectFeature: "rect-feature",
  /** pipe/barricade -> building template placement. */
  featureBuilding: "feature-building",
  /** catwalk: consumed and not emitted (see the CLAIMS note below). */
  dropped: "dropped",
  /** anything else -> a generic `feature` area_terrain polygon. */
  areaTerrain: "area-terrain",
});

// Predicates in one table so the disjointness check below is over the same list
// the dispatch is. Order is irrelevant: a piece matching two of them throws.
const CLAIMS = [
  [PIECE_KINDS.areaBuilding, (piece) => piece.piece_type === "area"],
  [
    PIECE_KINDS.ruinFeature,
    // Only a whole-L corner footprint becomes a ruin; any other corner piece
    // falls through to area_terrain.
    (piece, footprintOf) =>
      isRuinTemplate(piece.template) &&
      isLFootprint(piece.footprint ?? footprintOf(piece.template)),
  ],
  [PIECE_KINDS.rectFeature, (piece) => isRectFeatureTemplate(piece.template)],
  [
    PIECE_KINDS.featureBuilding,
    (piece) => isFeatureBuildingTemplate(piece.template),
  ],
  // Catwalks are consumed and not emitted: upstream models them as standalone
  // composites, and the parent area still becomes a building that already
  // covers upstream's 6x1in `pipes` part. The legacy `catwalk` template that
  // part is normalized onto is 7x2in, so the resolved child does overhang its
  // 6x2in parent by 0.5in at each end (measured: catwalk y 4.5015-11.5015
  // against area y 5.000-11.000). That overhang is an artifact of the oversized
  // legacy template rather than ground upstream draws - see the `pipes` note on
  // PART_TO_TEMPLATE in battlemaster-normalize.mjs - and is accepted, not
  // emitted.
  [PIECE_KINDS.dropped, (piece) => piece.template === "catwalk"],
];

/**
 * The single kind of one layout piece.
 *
 * @param {object} piece - a 40kdc layout piece.
 * @param {(id: string) => object | undefined} footprintOf - corpus footprint
 *   lookup, used to test a corner piece's footprint for the L shape.
 * @returns {string} one of PIECE_KINDS.
 * @throws if two converters would claim the same piece.
 */
export function classifyPiece(piece, footprintOf) {
  const kinds = CLAIMS.filter(([, claims]) => claims(piece, footprintOf)).map(
    ([kind]) => kind,
  );
  if (kinds.length > 1) {
    throw new Error(
      `piece ${piece.id ?? "?"} (${piece.piece_type}/${piece.template}) ` +
        `matches more than one kind: ${kinds.join(", ")}`,
    );
  }
  return kinds[0] ?? PIECE_KINDS.areaTerrain;
}

/**
 * Convert every piece of one layout into the rows a combined.yml entry holds.
 *
 * Buckets are filled in one walk but concatenated per kind, so the generated
 * file keeps its established order (areas before pipes/barricades, ruins before
 * generators/gantries) rather than the interleaving of the source piece list.
 *
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @param {object} gwTemplates - the hand-authored building templates, read to
 *   size `area` placements.
 * @returns {{ templates: object[], features: object[], areaTerrain: object[] }}
 */
export function layoutPlacements(layout, gwTemplates) {
  const areaBuildings = [];
  const featureBuildings = [];
  const ruinFeatures = [];
  const rectFeatures = [];
  const areaTerrain = [];

  for (const piece of layout.pieces) {
    switch (classifyPiece(piece, layout.footprintOf)) {
      case PIECE_KINDS.areaBuilding:
        areaBuildings.push(
          areaBuildingPlacement(
            piece,
            layout.footprintOf(piece.template),
            gwTemplates,
          ),
        );
        break;
      case PIECE_KINDS.featureBuilding:
        featureBuildings.push(
          featureBuildingPlacement(piece, layout.footprintOf, layout.parentOf),
        );
        break;
      case PIECE_KINDS.ruinFeature:
        ruinFeatures.push(
          ruinFeaturePlacement(piece, layout.footprintOf, layout.parentOf),
        );
        break;
      case PIECE_KINDS.rectFeature:
        rectFeatures.push(
          rectFeaturePlacement(piece, layout.footprintOf, layout.parentOf),
        );
        break;
      case PIECE_KINDS.dropped:
        break;
      default:
        areaTerrain.push({
          shape: "polygon",
          x: 0,
          y: 0,
          points: layout
            .resolve(piece)
            .map((p) => ({ x: round(p.x), y: round(p.y) })),
          // One generic zone type, coloured by theme.area_terrain.feature.
          label: "feature",
        });
    }
  }

  return {
    templates: [...areaBuildings, ...featureBuildings],
    features: [...ruinFeatures, ...rectFeatures],
    areaTerrain,
  };
}
