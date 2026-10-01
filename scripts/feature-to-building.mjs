// Converts the Battlemaster barrier parts into `pipe` and `barricade`
// building-template placements. Each piece resolves (parent-area transform and
// own rotation composed) to an absolute polygon; we pin the template's TL/TR
// corners to the resolved edge whose length matches the template box width.
// Some pieces are reflected, but both shapes are reflection-symmetric, so one
// unmirrored template per shape reproduces the outline.

import { pieceFootprint, footprintPolygon } from "./terrain-resolver.mjs";
import { round } from "./emit-placement.mjs";
import { templateBounds } from "../src/building-coordinates.ts";
import { distance } from "../src/geometry.ts";

const near = (a, b) => Math.abs(a - b) < 0.05;

// Battlemaster part -> the gw building template drawing it.
const FEATURE_BUILDINGS = {
  "long-barrier": "pipe",
  "short-barrier": "barricade",
};

/** True for a Battlemaster part drawn as a pipe/barricade building. */
export const isFeatureBuildingPart = (part) =>
  Object.hasOwn(FEATURE_BUILDINGS, part);

/**
 * The building template for a barrier piece, checked against its footprint.
 * Throws if the footprint no longer matches the template box we pin against.
 *
 * @param {string} part - the piece's Battlemaster part.
 * @param {object} footprint - the piece's footprint.
 * @param {Record<string, object>} gwTemplates - templates-simple.yml `templates`.
 * @returns {{ name: string, width: number }} template name + its TL->TR edge.
 */
function buildingFor(part, footprint, gwTemplates) {
  const name = FEATURE_BUILDINGS[part];
  const ring = footprintPolygon(footprint);
  const long = Math.max(
    ...ring.map((p, i) => distance(p, ring[(i + 1) % ring.length])),
  );
  const width = name && templateBounds(gwTemplates[name], name).width;
  // Vertex count catches a reshaped barricade, the long edge a resized one.
  if (name && near(long, width) && (name !== "barricade" || ring.length === 8)) {
    return { name, width };
  }
  throw new Error(
    `no building template for part ${part} footprint ` +
      `(long edge ${long.toFixed(3)}, ${ring.length} verts)`,
  );
}

/**
 * Build a `buildings` placement for a single barrier feature piece.
 * @param {object} piece - feature piece: `part`, `position`, optional
 *   `rotation_degrees`, optional `parent_area_id`, and either `footprint` or a
 *   named `template` resolved via the layout's footprint lookup.
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @param {Record<string, object>} gwTemplates - templates-simple.yml `templates`.
 * @returns {{ type: string, corners: object, mirror: false }}
 */
export function featureBuildingPlacement(piece, layout, gwTemplates) {
  const footprint = pieceFootprint(piece, layout.footprintOf);
  const { name, width } = buildingFor(piece.part, footprint, gwTemplates);
  const ring = layout.resolve(piece);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (near(distance(a, b), width)) {
      return {
        type: name,
        corners: {
          TL: { x: round(a.x), y: round(a.y) },
          TR: { x: round(b.x), y: round(b.y) },
        },
        mirror: false,
      };
    }
  }
  throw new Error(
    `piece ${piece.id ?? "?"}: no ${width}" edge to pin for template ${name}`,
  );
}
