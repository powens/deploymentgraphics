// Converts a 40kdc `area` piece into a templates-simple.yml building placement.
// The piece's frame (its Piece pose, from terrain-resolver.mjs) is composed
// with a rigid map G (gw-local -> area-local) whose determinant matches the
// pose's parity, so the result is a pure rotation -- all the building renderer
// can reproduce.
// We then pin the gw template's TL and TR corners (mirror:false).

import { footprintPolygon, pieceFrame } from "./terrain-resolver.mjs";
import { round } from "./emit-placement.mjs";
import { templateBounds } from "../src/building-coordinates.ts";
import { bounds, det, matmul, matvec } from "../src/geometry.ts";

// 40kdc area template id -> gw template + footprint relationship.
//   exact     : identical dims (lines/pipes).
//   transpose : gw bbox is the area bbox rotated 90 (gw H x W of area W x H).
//   trapezoid : gw `shoe` is the vertical flip of `area-trapezoid`;
//               `shoe-mirror` is the un-flipped shape. Picked by handedness.
const AREA_TO_TEMPLATE = {
  "area-large": { kind: "transpose", gw: "large-area" },
  "area-medium": { kind: "transpose", gw: "small-area" },
  "area-long-line": { kind: "exact", gw: "large-pipes" },
  "area-short-line": { kind: "exact", gw: "small-pipes" },
  // gw template chosen dynamically by handedness: shoe / shoe-mirror.
  "area-trapezoid": { kind: "trapezoid" },
};

// Rigid map G (gw-local -> area-local). det(G) matches det(M) so M*G is a pure
// rotation. Wa/Ha: see the note at the call site.
const gMap = (kind, mirrored, Wa, Ha) => {
  if (kind === "exact") {
    return mirrored
      ? { Glin: [[-1, 0], [0, 1]], Gtrans: { x: Wa, y: 0 } }
      : { Glin: [[1, 0], [0, 1]], Gtrans: { x: 0, y: 0 } };
  }
  if (kind === "transpose") {
    return mirrored
      ? { Glin: [[0, 1], [1, 0]], Gtrans: { x: 0, y: 0 } }
      : { Glin: [[0, -1], [1, 0]], Gtrans: { x: Wa, y: 0 } };
  }
  // trapezoid
  return mirrored
    ? { Glin: [[1, 0], [0, -1]], Gtrans: { x: 0, y: Ha } }
    : { Glin: [[1, 0], [0, 1]], Gtrans: { x: 0, y: 0 } };
};

/**
 * Build a `buildings` placement for a 40kdc `area` piece.
 *
 * @param {object} piece - area piece: template, position, optional
 *   rotation_degrees, optional mirror ("horizontal").
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @param {Record<string, object>} gwTemplates - templates-simple.yml `templates`.
 * @returns {{type: string, corners: object, mirror: false}}
 */
export function areaBuildingPlacement(piece, layout, gwTemplates) {
  const map = AREA_TO_TEMPLATE[piece.template];
  if (!map) {
    throw new Error(`no gw template mapping for area template ${piece.template}`);
  }
  // The template's footprint, not `pieceFootprint`'s inline-first precedence;
  // battlemaster-normalize refuses to emit an inline footprint on an area piece.
  const areaFootprint = layout.footprintOf(piece.template);
  if (!areaFootprint) {
    throw new Error(`no 40kdc footprint for area template ${piece.template}`);
  }
  const { matrix: M, place } = pieceFrame(piece, areaFootprint);
  const mirrored = det(M) < 0;
  const type =
    map.kind === "trapezoid" ? (mirrored ? "shoe" : "shoe-mirror") : map.gw;

  // Wa/Ha are the footprint's far-edge coordinates, not its extents: gMap uses
  // them as absolute bbox corners. They differ for three of the archetype
  // polygons, whose bbox runs to between -0.26 and -0.6in on one axis.
  const { maxX: Wa, maxY: Ha } = bounds(footprintPolygon(areaFootprint));

  const { Glin, Gtrans } = gMap(map.kind, mirrored, Wa, Ha);
  const TgwLin = matmul(M, Glin);
  const { x: tx, y: ty } = place(Gtrans);

  // The declared template box, so the pins hold for templates-real.yml too
  // (see Template box in CONTEXT.md).
  const Wg = templateBounds(gwTemplates[type], type).width;
  const tr = matvec(TgwLin, { x: Wg, y: 0 }); // TL is the origin, so TL_abs = (tx, ty)
  return {
    type,
    corners: {
      TL: { x: round(tx), y: round(ty) },
      TR: { x: round(tr.x + tx), y: round(tr.y + ty) },
    },
    mirror: false,
  };
}
