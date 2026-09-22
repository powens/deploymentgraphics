// Converts 40kdc `pipe` and `barricade` feature pieces into building-template
// placements. Each piece resolves (parent-area transform and own rotation
// composed) to an absolute polygon; we pin the template's TL/TR corners to the
// resolved edge whose length matches the template box width. Neither piece is
// mirrored and both shapes are reflection-symmetric, so one non-mirrored
// template per shape reproduces the outline.

import { pieceFootprint, footprintPolygon } from "./terrain-resolver.mjs";
import { round } from "./emit-placement.mjs";
import { templateBounds } from "../src/building-coordinates.ts";
import { distance } from "../src/geometry.ts";

const near = (a, b) => Math.abs(a - b) < 0.05;

/**
 * Pick the building template that reproduces a pipe/barricade footprint.
 * Throws if upstream no longer matches the template box we pin against.
 *
 * @param {string} template - the 40kdc template id.
 * @param {object} footprint - the piece's footprint.
 * @param {Record<string, object>} gwTemplates - templates-simple.yml `templates`.
 * @returns {{ name: string, width: number }} template name + its TL->TR edge.
 */
function classifyFeature(template, footprint, gwTemplates) {
  const ring = footprintPolygon(footprint);
  const long = Math.max(
    ...ring.map((p, i) => distance(p, ring[(i + 1) % ring.length])),
  );
  const widthOf = (name) => templateBounds(gwTemplates[name], name).width;
  if (template === "pipe") {
    const width = widthOf("pipe");
    if (near(long, width)) return { name: "pipe", width };
  }
  if (template === "barricade") {
    const width = widthOf("barricade");
    // Vertex count catches a reshaped barricade, the long edge a resized one.
    if (ring.length === 8 && near(long, width)) {
      return { name: "barricade", width };
    }
  }
  throw new Error(
    `no building template for ${template} footprint ` +
      `(long edge ${long.toFixed(3)}, ${ring.length} verts)`,
  );
}

/** True for a 40kdc template that maps to a pipe/barricade building. */
export const isFeatureBuildingTemplate = (id) =>
  id === "pipe" || id === "barricade";

/**
 * Build a `buildings` placement for a single pipe/barricade feature piece.
 * @param {object} piece - feature piece: `template`, `position`, optional
 *   `rotation_degrees`, optional `parent_area_id`, and either `footprint` or a
 *   named template resolved via the layout's footprint lookup.
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @param {Record<string, object>} gwTemplates - templates-simple.yml `templates`.
 * @returns {{ type: string, corners: object, mirror: false }}
 */
export function featureBuildingPlacement(piece, layout, gwTemplates) {
  const footprint = pieceFootprint(piece, layout.footprintOf);
  const { name, width } = classifyFeature(piece.template, footprint, gwTemplates);
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
