// Converts 40kdc `pipe` and `barricade` feature pieces into building-template
// placements. Parallels scripts/area-to-building.mjs and scripts/rect-to-feature.mjs.
//
// A pipe piece (5.5" rectangle) maps to the `pipe` template; a barricade piece
// (an 8-vertex polygon) maps to `barricade`. A piece resolves (via resolvePiece,
// which composes any parent-area transform and the piece's own rotation) to an
// absolute polygon in footprint-vertex order. Neither piece is mirrored, and
// each shape is reflection-symmetric or a rectangle, so a single non-mirrored
// template per shape reproduces the outline. We pin the template's TL/TR
// bounding-box corners to the resolved edge whose length matches the template
// width.

import { resolvePiece, footprintPolygon } from "./terrain-resolver.mjs";
import { round } from "./area-to-building.mjs";

const near = (a, b) => Math.abs(a - b) < 0.05;

/**
 * Pick the building template that reproduces a pipe/barricade footprint.
 * @returns {{ name: string, width: number }} template name + its TL->TR edge.
 */
function classifyFeature(template, footprint) {
  const ring = footprintPolygon(footprint);
  const long = Math.max(
    ...ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length];
      return Math.hypot(q.x - p.x, q.y - p.y);
    }),
  );
  if (template === "pipe" && near(long, 5.5)) return { name: "pipe", width: 5.5 };
  if (template === "barricade" && ring.length === 8) {
    return { name: "barricade", width: 3.5 };
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
 *   named template resolved via `lookupFootprint`.
 * @param {(id: string) => object | undefined} lookupFootprint
 * @param {(id: string) => object | undefined} [getParent]
 * @returns {{ type: string, corners: object, mirror: false }}
 */
export function featureBuildingPlacement(piece, lookupFootprint, getParent) {
  const footprint = piece.footprint ?? lookupFootprint(piece.template);
  if (!footprint) {
    throw new Error(
      `piece ${piece.id ?? "?"} has no footprint or known template`,
    );
  }
  const { name, width } = classifyFeature(piece.template, footprint);
  const ring = resolvePiece(piece, lookupFootprint, getParent);
  // Pin the resolved edge whose length matches the template width as TL->TR.
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (near(Math.hypot(b.x - a.x, b.y - a.y), width)) {
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

/**
 * Resolve every pipe/barricade piece in a layout to a building placement.
 * @param {object} layout - a 40kdc layout ({ pieces }).
 * @param {(id: string) => object | undefined} lookupFootprint
 * @param {(id: string) => object | undefined} getParent
 * @returns {{ buildings: object[], consumedIds: Set<string> }}
 */
export function featureBuildings(layout, lookupFootprint, getParent) {
  const buildings = [];
  const consumedIds = new Set();
  for (const piece of layout.pieces) {
    if (!isFeatureBuildingTemplate(piece.template)) continue;
    buildings.push(featureBuildingPlacement(piece, lookupFootprint, getParent));
    consumedIds.add(piece.id);
  }
  return { buildings, consumedIds };
}
