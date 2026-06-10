// Resolves a 40kdc-data terrain piece to an absolute board polygon.
//
// Source model: each piece references a template footprint (or carries an
// inline `footprint`); `position` anchors the footprint's area centroid;
// `rotation_degrees` and `mirror` apply about that centroid. Verified against
// the upstream terrain-resolver conformance suite.
// Order: center -> mirror -> rotate -> translate.

/** Footprint as a closed ring of { x, y } points. */
export function footprintPolygon(footprint) {
  if (footprint.type === "rectangle") {
    const { width: w, height: h } = footprint;
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  if (footprint.type === "polygon") {
    return footprint.points.map((p) => ({ x: p.x, y: p.y }));
  }
  throw new Error(`unsupported footprint type: ${footprint.type}`);
}

/**
 * Area centroid of a simple polygon (shoelace). Falls back to the vertex
 * average for a degenerate (zero-area) ring.
 */
export function centroid(points) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    area += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (area === 0) {
    const n = points.length;
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

/**
 * Resolve a piece to absolute board-inch vertices.
 * @param {object} piece - `position`, optional `rotation_degrees`, optional
 *   `mirror` ("horizontal"|"vertical"), and either `footprint` or `template`.
 * @param {(id: string) => object | null | undefined} lookupFootprint
 */
export function resolvePiece(piece, lookupFootprint) {
  const footprint = piece.footprint ?? lookupFootprint(piece.template);
  if (!footprint) {
    throw new Error(
      `piece ${piece.id ?? "?"} has no footprint or known template`,
    );
  }
  const ring = footprintPolygon(footprint);
  const c = centroid(ring);
  const theta = ((piece.rotation_degrees ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const { mirror } = piece;
  return ring.map((p) => {
    let x = p.x - c.x;
    let y = p.y - c.y;
    if (mirror === "horizontal") x = -x;
    if (mirror === "vertical") y = -y;
    return {
      x: x * cos - y * sin + piece.position.x,
      y: x * sin + y * cos + piece.position.y,
    };
  });
}
