// Turns a 40kdc layout's `is_objective` pieces into objective markers.
//
// Most layouts mark each objective with a single piece, but the central
// objective is often built from TWO pieces whose footprints touch (a pair of
// `area-trapezoid` "shoe" halves, or a pair of `area-medium`/`area-large`
// pieces). Those represent ONE objective and so collapse to a single marker at
// the pair's midpoint (which lands on the board centre). Pieces whose
// footprints sit clearly apart each keep their own marker — even when, by
// symmetry, their midpoint is also the board centre.
//
// Each source objective carries an `objective_role` (center / home /
// expansion); it rides along on the marker. The `home` role renders as the
// keep/fortress icon, every other role as the neutral skull.
//
// Touching is measured as the crossing-aware gap between the two resolved
// footprint polygons (ringGap). Across the vendored layouts: 25 of the 28
// touching pairs gap by exactly 0, three sit at 0.35-0.38in, and the nearest
// genuinely-separate pair gaps by 1.98in. So the empty band is (0.38, 1.98) —
// real, but not the rounding-error sliver the figures below the threshold
// suggest, and the three outliers are what the threshold is absorbing.

import { round } from "./area-to-building.mjs";
import { ringGap } from "../src/geometry.ts";

// Footprint gap (inches) at or below which two objective pieces count as one
// objective. Sits in the empty band between the touching pairs (<=0.38) and the
// nearest genuinely-separate pair (1.98).
const TOUCH_GAP = 0.5;

/**
 * Build the objective markers for a layout. Each `is_objective` piece is one
 * marker, except that pieces whose footprints touch are clustered and emitted
 * as a single marker at the average of their positions.
 *
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @returns {Array<{ type: "skull", pos: { x: number, y: number } }>}
 */
export function objectiveIcons(layout) {
  // A layout derived by spreading (`{ ...layout, pieces }`) loses the
  // non-enumerable lookups. Without them nothing resolves, every objective
  // stands alone, and the clustering below silently stops happening — so say
  // so instead. Rewrap with withLookups (scripts/terrain-corpus.mjs).
  if (typeof layout.resolve !== "function") {
    throw new TypeError(
      `layout ${layout.id ?? "?"} carries no resolve(); wrap it with withLookups`,
    );
  }
  const objectives = layout.pieces.filter((p) => p.is_objective);
  // Resolve each objective to an absolute polygon for the touch test. A piece
  // without a footprint (no template) degenerates to its single position point,
  // which never touches anything — it simply stands alone. Every other resolve
  // failure (a missing parent, an unsupported footprint type) is a data fault
  // and propagates.
  const polys = objectives.map((p) => {
    const footprint = p.footprint ?? layout.footprintOf(p.template);
    return footprint ? layout.resolve(p) : [p.position];
  });

  // Union-find over touching pairs so a cluster of mutually-touching pieces
  // collapses to one marker.
  const parent = objectives.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let i = 0; i < objectives.length; i++) {
    for (let j = i + 1; j < objectives.length; j++) {
      if (ringGap(polys[i], polys[j]) <= TOUCH_GAP) {
        parent[find(i)] = find(j);
      }
    }
  }

  // Group member positions by cluster root, preserving first-seen order. The
  // members of a cluster share an objective_role (only the touching `center`
  // pair ever clusters), so the root's role labels the whole marker.
  const clusters = new Map();
  objectives.forEach((p, i) => {
    const root = find(i);
    let group = clusters.get(root);
    if (!group) clusters.set(root, (group = { positions: [], role: p.objective_role }));
    group.positions.push(p.position);
  });

  return [...clusters.values()].map(({ positions, role }) => {
    const n = positions.length;
    const x = positions.reduce((s, p) => s + p.x, 0) / n;
    const y = positions.reduce((s, p) => s + p.y, 0) / n;
    // The "home" objective renders as the keep/fortress icon; every other role
    // keeps the neutral skull. The role rides along on the marker for any
    // downstream (e.g. theme) use.
    const marker = {
      type: role === "home" ? "fortress" : "skull",
      pos: { x: round(x), y: round(y) },
    };
    if (role) marker.objective_role = role;
    return marker;
  });
}
