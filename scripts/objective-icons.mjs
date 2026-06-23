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
// Touching is measured as the gap between the two resolved footprint polygons:
// across the vendored layouts the touching central pairs gap by ~0 (max 0.03in
// from rounding) while the nearest non-touching pair gaps by 2.83in, so a small
// threshold separates them cleanly.

import { resolvePiece } from "./terrain-resolver.mjs";
import { round } from "./area-to-building.mjs";

// Footprint gap (inches) at or below which two objective pieces count as one
// objective. Sits in the empty band between the touching pairs (<=0.03) and the
// nearest genuinely-separate pair (2.83).
const TOUCH_GAP = 0.5;

/** Distance from point `p` to segment `a`-`b`. */
function pointSegDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Smallest distance between the edges of two simple polygons. Zero (or near it)
 * when they touch or overlap. Treats each ring as closed.
 */
function polygonGap(A, B) {
  let min = Infinity;
  for (const p of A) {
    for (let j = 0; j < B.length; j++) {
      min = Math.min(min, pointSegDistance(p, B[j], B[(j + 1) % B.length]));
    }
  }
  for (const p of B) {
    for (let j = 0; j < A.length; j++) {
      min = Math.min(min, pointSegDistance(p, A[j], A[(j + 1) % A.length]));
    }
  }
  return min;
}

/**
 * Build the objective markers for a layout. Each `is_objective` piece is one
 * marker, except that pieces whose footprints touch are clustered and emitted
 * as a single marker at the average of their positions.
 *
 * @param {object} layout - a 40kdc layout ({ pieces }).
 * @param {(id: string) => object} lookupFootprint
 * @param {(id: string) => object} getParent
 * @returns {Array<{ type: "skull", pos: { x: number, y: number } }>}
 */
export function objectiveIcons(layout, lookupFootprint, getParent) {
  const objectives = layout.pieces.filter((p) => p.is_objective);
  // Resolve each objective to an absolute polygon for the touch test. A piece
  // without a footprint (no template) degenerates to its single position point,
  // which never touches anything — it simply stands alone.
  const polys = objectives.map((p) => {
    try {
      return resolvePiece(p, lookupFootprint, getParent);
    } catch {
      return [p.position];
    }
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
      if (polygonGap(polys[i], polys[j]) <= TOUCH_GAP) {
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
