// Owns a Battlemaster composite `area` from size class to gw building. Two
// entry points, one per pipeline stage:
//
//   areaPiece             - battlemaster-normalize.mjs hands over a composite
//                           piece; this emits it as an `area` drawn by its
//                           class's legacy archetype, registered (V) so the
//                           archetype stands where upstream's outline does.
//   areaBuildingPlacement - layout-to-placements.mjs hands that area back;
//                           this pins the class's gw building onto it.
//
// The archetype is the area's footprint (and so the parent frame its children
// and objective icons resolve against) but otherwise an internal detail: the
// rigid map G below is tuned to each archetype's drawing orientation, and V is
// what puts every composite of a class into that orientation.

import { round } from "./emit-placement.mjs";
import {
  footprintPolygon,
  poseFromMatrix,
  poseMatrix,
} from "./terrain-resolver.mjs";
import { templateBounds } from "../src/building-coordinates.ts";
import {
  FLIP_X,
  bounds,
  centroid,
  det,
  matmul,
  matvec,
  rotationMatrix,
  shapeDistance,
} from "../src/geometry.ts";

/**
 * Each Battlemaster size class: the legacy `archetype` that draws it, and the
 * gw building it becomes, with the footprint relationship G is built from.
 * Every composite's footprint matches its archetype's bounding box to within
 * 0.06in.
 *
 *   exact     : identical dims (lines/pipes).
 *   transpose : gw bbox is the archetype bbox rotated 90 (gw H x W of W x H).
 *   trapezoid : gw `shoe` is the vertical flip of `area-trapezoid`;
 *               `shoe-mirror` is the un-flipped shape. Picked by handedness.
 *
 * `LongLineTower` is not a sixth class: one composite
 * (`bm-composite-longlinetower-flip-...`) drops the separator its siblings keep
 * (`bm-composite-longline-tower-...`) in both id and name. Its footprint is a
 * rigid variant of the other LongLine ones.
 */
export const AREA_CLASSES = {
  BigRect: { archetype: "area-large", kind: "transpose", gw: "large-area" },
  SmallRect: { archetype: "area-medium", kind: "transpose", gw: "small-area" },
  ShortLine: { archetype: "area-short-line", kind: "exact", gw: "small-pipes" },
  LongLine: { archetype: "area-long-line", kind: "exact", gw: "large-pipes" },
  LongLineTower: {
    archetype: "area-long-line",
    kind: "exact",
    gw: "large-pipes",
  },
  // gw template chosen dynamically by handedness: shoe / shoe-mirror.
  Triangle: { archetype: "area-trapezoid", kind: "trapezoid" },
};

/** Size class of a composite, read from its name ("Battlemaster BigRect CD GH 01" -> BigRect). */
function classOf(composite) {
  const cls = composite?.name?.split(" ")[1];
  if (!cls || !AREA_CLASSES[cls]) {
    throw new Error(
      `unknown Battlemaster size class for composite ${composite?.id ?? "?"}`,
    );
  }
  return cls;
}

/**
 * Snap a rigid matrix to integers. `rotationMatrix` leaves 1e-17 noise on a
 * quarter-turn, which would leak into `poseFromMatrix`'s angle and into deep-equals
 * on a variant; `+ 0` also canonicalizes -0, which deep-equal distinguishes.
 */
const roundMatrix = (M) => M.map((row) => row.map((x) => Math.round(x) + 0));

/** The eight rigid maps a composite footprint can sit under, by name. */
const CANDIDATES = Object.fromEntries(
  [0, 90, 180, 270].flatMap((d) => [
    [`R${d}`, roundMatrix(rotationMatrix(d))],
    [`R${d}.FX`, roundMatrix(matmul(rotationMatrix(d), FLIP_X))],
  ]),
);

/**
 * V - a composite's footprint is a rigid transform of its class's archetype,
 * not a copy. G's trapezoid branch is hard-coded to `area-trapezoid`'s
 * orientation, so V is folded into the area's own transform rather than
 * carried as an inline footprint (which mis-places it by ~6in); the
 * normalizer folds it back out of every child.
 *
 * Each size class's reference composite and the variant it is registered at.
 * `fitVariant` registers every other composite relative to its class's
 * reference; these six are pinned. V decides which way round the legacy
 * archetype polygon is drawn when it stands in for the composite.
 *
 * They cannot be fitted against the archetype polygon itself: upstream's
 * 167-348 vertex traced outlines only resemble the archetypes, and that fit
 * prefers the *other* reflection for four of the six classes, by a 4-7x
 * margin (shape distance over the eight rigid maps):
 *
 *   class          best fit        registered      runner-up
 *   BigRect        R180.FX  0.114  R180     0.552  R0       0.411
 *   LongLine       R0.FX    0.084  R0       0.590  R0       0.590
 *   LongLineTower  R0       0.084  R0.FX    0.590  R0.FX    0.590
 *   ShortLine      R180     0.069  R180     0.069  R0       0.288
 *   SmallRect      R180.FX  0.071  R0       0.265  R0       0.265
 *   Triangle       R90.FX   0.706  R90.FX   0.706  R270.FX  2.537
 *
 * That shows the coarse legacy polygons and upstream's traces disagree about
 * chirality, not that the port is mirrored; the pre-pull rendering is what
 * has to be kept, and containment cannot referee (all four reflections hold
 * the same children). So these were measured against the pre-pull corpus
 * (see battlemaster-normalize.mjs): pair each new area with the nearest
 * pre-pull area of the same archetype (assigned globally within a layout) and
 * read V = M_new^-1 . M_old.
 */
const CLASS_REFERENCE = {
  BigRect: ["bm-composite-bigrect-cd-ef-01-19f1adc57b", "R180"],
  LongLine: ["bm-composite-longline-tower-3be6fa3536", "R0"],
  LongLineTower: ["bm-composite-longlinetower-flip-06c4f02941", "R0.FX"],
  ShortLine: ["bm-composite-shortline-barrier-348db27c93", "R180"],
  SmallRect: ["bm-composite-smallrect-generator-44c45681fa", "R0"],
  Triangle: ["bm-composite-triangle-ab-corner-02-4b8322162e", "R90.FX"],
};

/** A ring translated so its area centroid sits on the origin. */
const centred = (ring) => {
  const c = centroid(ring);
  return ring.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
};

/**
 * Fit one composite's footprint against its class's reference. Within a class
 * the composites coincide to 0.0000in under one of the eight CANDIDATES (0.21in
 * or worse under every other), so the variant is that map composed onto the
 * reference's pinned one. A shape upstream has not shipped before throws here,
 * naming the composite, rather than taking the identity and moving the area
 * ~6in.
 */
function fitVariant(composite, cls, templatesById) {
  const [refId, refName] = CLASS_REFERENCE[cls] ?? [];
  if (!refName) {
    throw new Error(`size class ${cls} has no reference composite registered`);
  }
  if (composite.id === refId) return CANDIDATES[refName];

  const ref = templatesById.get(refId);
  if (!ref) {
    throw new Error(
      `the ${cls} reference composite ${refId} is not in the template table`,
    );
  }
  if (!ref.footprint) {
    throw new Error(
      `the ${cls} reference composite ${refId} has no footprint to fit against`,
    );
  }
  if (!composite.footprint) {
    throw new Error(
      `composite ${composite.id} has no footprint to fit against the ${cls} reference ${refId}`,
    );
  }
  const refRing = centred(footprintPolygon(ref.footprint));
  const ring = centred(footprintPolygon(composite.footprint));
  const fits = Object.entries(CANDIDATES)
    .map(([name, M]) => [
      shapeDistance(
        refRing.map((p) => matvec(M, p)),
        ring,
      ),
      M,
      name,
    ])
    .sort((a, b) => a[0] - b[0]);
  const [best, W, bestName] = fits[0];
  if (best >= 1e-3) {
    throw new Error(
      `composite ${composite.id} is not a rigid transform of the ${cls} reference ${refId} (best fit ${best.toFixed(4)}in)`,
    );
  }
  // A self-symmetric footprint fits under several candidates, leaving the
  // variant to CANDIDATES insertion order rather than the data.
  const [runnerUp, , runnerUpName] = fits[1];
  if (runnerUp < 1e-3) {
    throw new Error(
      `composite ${composite.id} fits the ${cls} reference ${refId} under both ` +
        `${bestName} (${best.toFixed(4)}in) and ${runnerUpName} (${runnerUp.toFixed(4)}in): ` +
        `its footprint has a rigid self-symmetry, so the shape does not determine the variant`,
    );
  }
  return roundMatrix(matmul(W, CANDIDATES[refName]));
}

/** Fitted once per composite per template table. */
const variantCache = new WeakMap();

/** The rigid variant V a composite's footprint is registered at. */
function variantOf(composite, cls, templatesById) {
  let fitted = variantCache.get(templatesById);
  if (!fitted) variantCache.set(templatesById, (fitted = new Map()));
  let V = fitted.get(composite.id);
  if (!V) {
    fitted.set(composite.id, (V = fitVariant(composite, cls, templatesById)));
  }
  return V;
}

/**
 * The `area` piece a composite piece becomes: drawn by its class's archetype,
 * with V folded into its pose, and carrying its `size_class`, which is what
 * `areaBuildingPlacement` dispatches on.
 *
 * @param {object} piece - an upstream composite piece.
 * @param {object} composite - its `bm-composite-` template.
 * @param {Map<string, object>} templatesById - the vendored template table.
 * @returns {{ area: object, V: number[][] }} the area, and the rigid map its
 *   pose carries beyond the piece's own, which a child must undo.
 */
export function areaPiece(piece, composite, templatesById) {
  const cls = classOf(composite);
  const { archetype } = AREA_CLASSES[cls];
  // Composite pieces carry no inline footprint today, but upstream uses them
  // elsewhere (kotc-colosseum). resolvePiece would prefer it over the
  // archetype, while the gw building is picked by size class, so the building
  // would be fitted to a shape the archetype does not draw.
  if (piece.footprint) {
    throw new Error(
      `piece ${piece.id} carries an inline footprint; composite retemplating to ${archetype} would discard it`,
    );
  }
  const V = variantOf(composite, cls, templatesById);
  const area = { ...piece, template: archetype, size_class: cls };
  delete area.mirror;
  Object.assign(area, poseFromMatrix(matmul(poseMatrix(piece), V)));
  return { area, V };
}

// Rigid map G (gw-local -> archetype-local). det(G) matches det(M) so M*G is a
// pure rotation. Wa/Ha: see the note at the call site.
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
 * Build a `buildings` placement for an `area` piece from `areaPiece`.
 *
 * The piece's resolved frame (its Piece pose, from terrain-resolver.mjs) is
 * composed with G, so the result is a pure rotation -- all the building
 * renderer can reproduce. We then pin the gw template's TL and TR corners
 * (mirror:false).
 *
 * @param {object} piece - area piece: size_class, its archetype template,
 *   position, optional rotation_degrees, optional mirror ("horizontal").
 * @param {object} layout - a resolved layout from scripts/terrain-corpus.mjs.
 * @param {Record<string, object>} gwTemplates - templates-simple.yml `templates`.
 * @returns {{type: string, corners: object, mirror: false}}
 */
export function areaBuildingPlacement(piece, layout, gwTemplates) {
  const map = AREA_CLASSES[piece.size_class];
  if (!map) {
    throw new Error(`no gw template mapping for size class ${piece.size_class}`);
  }
  // G is tuned to the archetype's drawing, so the piece must resolve through it.
  if (piece.template !== map.archetype || piece.footprint) {
    throw new Error(
      `piece ${piece.id ?? "?"} of size class ${piece.size_class} is not drawn by its archetype ${map.archetype}`,
    );
  }
  const { local, matrix: M, place } = layout.resolve(piece);
  const mirrored = det(M) < 0;
  const type =
    map.kind === "trapezoid" ? (mirrored ? "shoe" : "shoe-mirror") : map.gw;

  // Wa/Ha are the footprint's far-edge coordinates, not its extents: gMap uses
  // them as absolute bbox corners. They differ for three of the archetype
  // polygons, whose bbox runs to between -0.26 and -0.6in on one axis.
  const { maxX: Wa, maxY: Ha } = bounds(local);

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
