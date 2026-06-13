// Converts a 40kdc `area` piece into a gw.yml building-template placement.
// The piece's own affine transform (centre on centroid -> mirror -> rotate ->
// translate, matching terrain-resolver.mjs) is composed with a fixed rigid map
// G (gw-local -> area-local). The G variant is chosen so its determinant
// matches the piece's mirror parity, making the composed linear part a pure
// rotation -- which is all the building renderer can reproduce. We then pin the
// gw template's TL and TR bounding-box corners (mirror:false).

import { footprintPolygon, centroid } from "./terrain-resolver.mjs";

/** Round to 3 dp; normalise -0 to 0 so combined.yml stays byte-stable. */
export const round = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
};

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

const matmul = (A, B) => [
  [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
  [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
];
const matvec = (A, v) => [
  A[0][0] * v[0] + A[0][1] * v[1],
  A[1][0] * v[0] + A[1][1] * v[1],
];

/** Bounding box of a gw template (rectangle width/height or polygon points). */
const gwBounds = (template) =>
  template.points
    ? {
        width: Math.max(...template.points.map((p) => p.x)),
        height: Math.max(...template.points.map((p) => p.y)),
      }
    : { width: template.width, height: template.height };

// Rigid map G (gw-local -> area-local) as { Glin, Gtrans }. The variant's
// determinant matches det(M) (i.e. the piece's mirror parity) so that M*G is a
// pure rotation. Wa/Ha are the area template's bbox dims.
const gMap = (kind, mirrored, Wa, Ha) => {
  if (kind === "exact") {
    return mirrored
      ? { Glin: [[-1, 0], [0, 1]], Gtrans: [Wa, 0] }
      : { Glin: [[1, 0], [0, 1]], Gtrans: [0, 0] };
  }
  if (kind === "transpose") {
    return mirrored
      ? { Glin: [[0, 1], [1, 0]], Gtrans: [0, 0] }
      : { Glin: [[0, -1], [1, 0]], Gtrans: [Wa, 0] };
  }
  // trapezoid
  return mirrored
    ? { Glin: [[1, 0], [0, -1]], Gtrans: [0, Ha] }
    : { Glin: [[1, 0], [0, 1]], Gtrans: [0, 0] };
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
  const Wa = Math.max(...ring.map((p) => p.x));
  const Ha = Math.max(...ring.map((p) => p.y));

  const theta = ((piece.rotation_degrees ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const sx = piece.mirror === "horizontal" ? -1 : 1;
  const sy = piece.mirror === "vertical" ? -1 : 1;
  // M = R(theta) * diag(sx, sy)
  const M = [
    [cos * sx, -sin * sy],
    [sin * sx, cos * sy],
  ];

  const { Glin, Gtrans } = gMap(map.kind, mirrored, Wa, Ha);
  const TgwLin = matmul(M, Glin);
  const shifted = matvec(M, [Gtrans[0] - c.x, Gtrans[1] - c.y]);
  const tx = shifted[0] + piece.position.x;
  const ty = shifted[1] + piece.position.y;

  const Wg = gwBounds(gwTemplates[type]).width;
  const tr = matvec(TgwLin, [Wg, 0]); // TL is the origin, so TL_abs = (tx, ty)
  return {
    type,
    corners: {
      TL: { x: round(tx), y: round(ty) },
      TR: { x: round(tr[0] + tx), y: round(tr[1] + ty) },
    },
    mirror: false,
  };
}
