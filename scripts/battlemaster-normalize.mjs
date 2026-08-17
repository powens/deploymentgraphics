// Translates upstream 40kdc "battlemaster-11e" composite layouts back into the
// legacy piece vocabulary the rest of this pipeline was built for.
//
// Upstream re-sourced the 11e Chapter Approved terrain from Battlemaster's TTS
// Map API. Where a layout used to list an `area` piece plus a handful of
// `feature` children (corner ruins, pipes, generators), it now lists only the
// area, and the children live in a `features[]` array on the *template*. The
// five footprint archetypes and every child template still exist upstream under
// their old ids, so the whole migration is a vocabulary rewrite: emit the same
// pieces the old data would have carried, and nothing downstream changes.
//
// Two subtleties make this more than a lookup table:
//
//   V - two of the three TR composites are rigid transforms of `area-trapezoid`
//       rather than copies of it. `gMap`'s trapezoid branch in
//       area-to-building.mjs is hard-coded to `area-trapezoid`'s orientation, so
//       the variant has to be folded into the piece's own transform instead of
//       carried as an inline footprint (which mis-places it by ~6in).
//
//   K - a Battlemaster part is a physical model, so its handedness is fixed no
//       matter how its parent composite is oriented. The legacy `corner-*`
//       polygons are chiral and `featureFromRefs` reads chirality from the
//       *resolved* arms, which a parent's `mirror: horizontal` flips. K cancels
//       the parent's parity and applies a per-part flip bit so each part always
//       renders as the same l-ruin variant.

/** Legacy area template for each Battlemaster size class. */
export const SIZE_CLASS = {
  BR: "area-large",
  SR: "area-medium",
  SL: "area-short-line",
  LL: "area-long-line",
  TR: "area-trapezoid",
};

// Legacy template for each Battlemaster part, plus `flip`: whether the part's
// true handedness is the opposite of the legacy polygon's own. Derived by
// matching each child against the nearest pre-pull piece of the mapped template
// and reading off the variant it rendered as; `small-l` / `small-l-flip` is the
// decisive pair (180/180 and 72/74 agreement). `corner-tiny` has equal arms, so
// its bit is cosmetic.
export const PART_TO_TEMPLATE = {
  ab: { template: "corner-ruin-balanced-left", flip: true },
  ef: { template: "corner-ruin-balanced-right", flip: false },
  co: { template: "corner-ruin-left", flip: false },
  gh: { template: "corner-ruin-right", flip: false },
  corner: { template: "corner-tiny", flip: true },
  "small-l": { template: "corner-short", flip: true },
  "small-l-flip": { template: "corner-short", flip: false },
  tower: { template: "gantry", flip: false },
  generator: { template: "generator", flip: false },
  "long-barrier": { template: "pipe", flip: false },
  "short-barrier": { template: "barricade", flip: false },
  pipes: { template: "catwalk", flip: false },
};

export const IDENTITY = [[1, 0], [0, 1]];
export const FLIP_X = [[-1, 0], [0, 1]];
export const FLIP_Y = [[1, 0], [0, -1]];

// Composites whose footprint is a rigid transform of their archetype rather
// than a copy of it. Everything absent from this table is byte-identical to its
// archetype; the registration test enforces that.
export const VARIANT = {
  "bm-bm-terrain-11e-1-composite-07-m0-p3": FLIP_Y,      // vertical flip
  "bm-bm-terrain-11e-1-composite-23-m1-p2": [[-1, 0], [0, -1]], // 180 degrees
};

const COMPOSITE_PREFIX = "bm-bm-terrain-11e-1-composite-";
const PART_PREFIX = "bm-bm-terrain-11e-1-part-";

/** True for an upstream Battlemaster composite area template. */
export const isCompositeTemplate = (id) =>
  typeof id === "string" && id.startsWith(COMPOSITE_PREFIX);

/** Size class of a composite, read from its name ("Battlemaster BR 01" -> BR). */
export function classOf(composite) {
  const cls = composite?.name?.split(" ")[1];
  if (!cls || !SIZE_CLASS[cls]) {
    throw new Error(
      `unknown Battlemaster size class for composite ${composite?.id ?? "?"}`,
    );
  }
  return cls;
}

/** Bare part name of a composite feature template id. */
export function partOf(templateId) {
  const part = templateId.startsWith(PART_PREFIX)
    ? templateId.slice(PART_PREFIX.length)
    : templateId;
  if (!PART_TO_TEMPLATE[part]) {
    throw new Error(`no legacy template mapping for part ${templateId}`);
  }
  return part;
}

export const matmul = (A, B) => [
  [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
  [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
];

export const matvec = (A, v) => ({
  x: A[0][0] * v.x + A[0][1] * v.y,
  y: A[1][0] * v.x + A[1][1] * v.y,
});

export const det = (A) => A[0][0] * A[1][1] - A[0][1] * A[1][0];

/** Rotation matrix for an angle in degrees. */
export function rotation(deg) {
  const t = (deg * Math.PI) / 180;
  return [
    [Math.cos(t), -Math.sin(t)],
    [Math.sin(t), Math.cos(t)],
  ];
}

/** Normalise degrees into [0, 360), snapping away float noise. */
const normDeg = (deg) => {
  const r = Math.round((((deg % 360) + 360) % 360) * 1e6) / 1e6;
  return r === 360 ? 0 : r;
};

/**
 * Factor an orthogonal 2x2 back into the `{ rotation_degrees, mirror }` pair
 * resolvePiece consumes, which applies mirror first then rotation (A = R . S).
 * An improper map always comes back as a horizontal mirror; the rotation
 * absorbs the difference between the two mirror axes.
 */
export function decompose(A) {
  const improper = det(A) < 0;
  const R = improper ? matmul(A, FLIP_X) : A;
  const out = {
    rotation_degrees: normDeg((Math.atan2(R[1][0], R[0][0]) * 180) / Math.PI),
  };
  if (improper) out.mirror = "horizontal";
  return out;
}

/** The piece's own linear map: R(rotation_degrees) . diag(sx, sy). */
export function pieceMatrix(piece) {
  const S =
    piece.mirror === "horizontal"
      ? FLIP_X
      : piece.mirror === "vertical"
        ? FLIP_Y
        : IDENTITY;
  return matmul(rotation(piece.rotation_degrees ?? 0), S);
}
