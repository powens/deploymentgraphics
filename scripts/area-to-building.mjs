// Converts a 40kdc `area` piece into a gw.yml building-template placement.
// The piece's own affine transform (centre on centroid -> mirror -> rotate ->
// translate, matching terrain-resolver.mjs) is composed with a fixed rigid map
// G (gw-local -> area-local). The G variant is chosen so its determinant
// matches the piece's mirror parity, making the composed linear part a pure
// rotation -- which is all the building renderer can reproduce. We then pin the
// gw template's TL and TR bounding-box corners (mirror:false).

import { footprintPolygon } from "./terrain-resolver.mjs";
import { round } from "./emit-placement.mjs";
import {
  bounds,
  centroid,
  matmul,
  matvec,
  rotationMatrix,
} from "../src/geometry.ts";

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

/**
 * Far-edge coordinates of a gw template's bounding box. A gw polygon's bbox is
 * required to start at 0,0 (`templateBounds` enforces it at render time), so
 * its maxima are also its width and height.
 */
const gwBounds = (template) => {
  if (!template.points) return { width: template.width, height: template.height };
  const { maxX, maxY } = bounds(template.points);
  return { width: maxX, height: maxY };
};

// Rigid map G (gw-local -> area-local) as { Glin, Gtrans }. The variant's
// determinant matches det(M) (i.e. the piece's mirror parity) so that M*G is a
// pure rotation. Wa/Ha are the area template's bbox dims.
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
 *   rotation_degrees, optional mirror ("horizontal"|"vertical").
 * @param {object} areaFootprint - the 40kdc template footprint for the piece.
 * @param {Record<string, object>} gwTemplates - templates-simple.yml `templates`.
 * @returns {{type: string, corners: object, mirror: false}}
 */
export function areaBuildingPlacement(piece, areaFootprint, gwTemplates) {
  const map = AREA_TO_TEMPLATE[piece.template];
  if (!map) {
    throw new Error(`no gw template mapping for area template ${piece.template}`);
  }
  const mirrored =
    piece.mirror === "horizontal" || piece.mirror === "vertical";
  const type =
    map.kind === "trapezoid" ? (mirrored ? "shoe" : "shoe-mirror") : map.gw;

  const ring = footprintPolygon(areaFootprint);
  const c = centroid(ring);
  // Wa/Ha are the *far edge coordinates* of the area footprint in its own
  // frame, not its extents — gMap uses them to name a bbox corner (e.g.
  // `{ x: Wa, y: 0 }` is the top-right), and a corner is an absolute position.
  // The two coincide for the named templates, whose footprints start at 0,0,
  // but not for the inline footprints battlemaster-normalize emits: 450 of
  // those have a bbox running to -0.48in on one axis.
  const { maxX: Wa, maxY: Ha } = bounds(ring);

  // M = R(theta) * diag(sx, sy)
  const sx = piece.mirror === "horizontal" ? -1 : 1;
  const sy = piece.mirror === "vertical" ? -1 : 1;
  const M = matmul(rotationMatrix(piece.rotation_degrees ?? 0), [
    [sx, 0],
    [0, sy],
  ]);

  const { Glin, Gtrans } = gMap(map.kind, mirrored, Wa, Ha);
  const TgwLin = matmul(M, Glin);
  const shifted = matvec(M, { x: Gtrans.x - c.x, y: Gtrans.y - c.y });
  const tx = shifted.x + piece.position.x;
  const ty = shifted.y + piece.position.y;

  const Wg = gwBounds(gwTemplates[type]).width;
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
