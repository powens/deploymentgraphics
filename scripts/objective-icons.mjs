// Turns a 40kdc layout's `is_objective` pieces into objective markers.
//
// The central objective is often built from two pieces whose footprints touch
// (a pair of `area-trapezoid` halves, or of `area-medium`/`area-large`); those
// collapse to one marker at the pair's midpoint. Pieces clearly apart keep
// their own marker even when their midpoint is the board centre.
//
// Touching is the gap between resolved footprints (ringGap). Across the vendored
// layouts, 25 of 28 touching pairs gap by 0, three by 0.35-0.38in, and the
// nearest separate pair by 1.98in.

import { round } from "./emit-placement.mjs";
import { pieceFootprintIfAny } from "./terrain-resolver.mjs";
import { ringGap } from "../src/geometry.ts";

// Inches; sits in the empty band (0.38, 1.98) measured above.
const TOUCH_GAP = 0.5;

/**
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @returns {Array<{ type: "skull" | "fortress", pos: { x: number, y: number } }>}
 */
export function objectiveIcons(layout) {
  const objectives = layout.pieces.filter((p) => p.is_objective);
  // A piece without a footprint degenerates to a one-point ring, which ringGap
  // still measures. Other resolve failures are data faults and propagate.
  const polys = objectives.map((p) => {
    const footprint = pieceFootprintIfAny(p, layout.footprintOf);
    return footprint ? layout.resolve(p) : [p.position];
  });

  // Union-find over touching pairs.
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

  // Only `center` pairs ever cluster, so the root's objective_role labels the
  // whole marker.
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
    return {
      type: role === "home" ? "fortress" : "skull",
      pos: { x: round(x), y: round(y) },
    };
  });
}
