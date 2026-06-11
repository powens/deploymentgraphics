// Resolves a 40kdc-data terrain piece to an absolute board polygon.
//
// Source model: each piece references a template footprint (or carries an
// inline `footprint`); `position` anchors the footprint's area centroid;
// `rotation_degrees` and `mirror` apply about that centroid. A piece with a
// `parent_area_id` is positioned in its parent area's centred local frame and
// then carried through the parent's own placement transform (composition).
// Verified against the upstream terrain-resolver conformance suite.
// Order (per piece): center -> mirror -> rotate -> translate; for a child the
// parent's (mirror -> rotate -> translate) is applied last.

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

/** Apply a piece's own mirror then rotation to a centred point (no translate). */
function orient(x, y, piece) {
  let ox = x;
  let oy = y;
  if (piece.mirror === "horizontal") ox = -ox;
  if (piece.mirror === "vertical") oy = -oy;
  const t = ((piece.rotation_degrees ?? 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return { x: ox * cos - oy * sin, y: ox * sin + oy * cos };
}

/** Full placement transform: mirror -> rotate -> translate(piece.position). */
function place(point, piece) {
  const o = orient(point.x, point.y, piece);
  return { x: o.x + piece.position.x, y: o.y + piece.position.y };
}

/**
 * Resolve a piece to absolute board-inch vertices.
 * @param {object} piece - `position`, optional `rotation_degrees`, optional
 *   `mirror` ("horizontal"|"vertical"), optional `parent_area_id`, and either
 *   `footprint` or `template`.
 * @param {(id: string) => object | null | undefined} lookupFootprint
 * @param {(id: string) => object | undefined} [getParent] - required only for
 *   pieces carrying a `parent_area_id`.
 */
export function resolvePiece(piece, lookupFootprint, getParent) {
  const footprint = piece.footprint ?? lookupFootprint(piece.template);
  if (!footprint) {
    throw new Error(
      `piece ${piece.id ?? "?"} has no footprint or known template`,
    );
  }
  const ring = footprintPolygon(footprint);
  const c = centroid(ring);
  // Centre on the centroid, apply this piece's own orientation, add its offset.
  const local = ring.map((p) => {
    const o = orient(p.x - c.x, p.y - c.y, piece);
    return { x: o.x + piece.position.x, y: o.y + piece.position.y };
  });
  if (!piece.parent_area_id) return local;
  if (!getParent) {
    throw new Error(
      `piece ${piece.id ?? "?"} has parent_area_id but no getParent provided`,
    );
  }
  const parent = getParent(piece.parent_area_id);
  if (!parent) {
    throw new Error(
      `piece ${piece.id ?? "?"} references missing parent ${piece.parent_area_id}`,
    );
  }
  // `local` is in the parent's centred frame; carry it through the parent's
  // placement transform.
  return local.map((p) => place(p, parent));
}
