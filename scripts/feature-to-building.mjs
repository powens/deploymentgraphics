// Converts 40kdc `pipe` and `barricade` feature pieces into building-template
// placements. Parallels scripts/area-to-building.mjs and scripts/rect-to-feature.mjs.
//
// A pipe piece maps to the `pipe` template; a barricade piece (an 8-vertex
// polygon) maps to `barricade`. Each template's pinned edge is its own
// **Template box** width, read through `templateBounds`. A piece resolves (via resolvePiece,
// which composes any parent-area transform and the piece's own rotation) to an
// absolute polygon in footprint-vertex order. Neither piece is mirrored, and
// each shape is reflection-symmetric or a rectangle, so a single non-mirrored
// template per shape reproduces the outline. We pin the template's TL/TR
// bounding-box corners to the resolved edge whose length matches the template
// width.

import { pieceFootprint, footprintPolygon } from "./terrain-resolver.mjs";
import { round } from "./emit-placement.mjs";
import { templateBounds } from "../src/building-coordinates.ts";
import { distance } from "../src/geometry.ts";

const near = (a, b) => Math.abs(a - b) < 0.05;

/**
 * Pick the building template that reproduces a pipe/barricade footprint.
 *
 * The pinned edge is the gw template's own **Template box** width (see
 * CONTEXT.md), read through `templateBounds` rather than restated here: the
 * check then asks whether upstream still matches the template we actually pin,
 * and cannot drift from it.
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
    // Two guards, catching two different upstream regressions: the vertex count
    // a reshaped barricade, the long edge a resized one.
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
  // Pin the resolved edge whose length matches the template width as TL->TR.
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
