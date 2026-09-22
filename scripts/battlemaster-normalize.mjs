import { footprintPolygon } from "./terrain-resolver.mjs";
import {
  FLIP_X,
  FLIP_Y,
  IDENTITY,
  bounds,
  boundsCentre,
  boundsSize,
  centroid,
  det,
  matmul,
  matvec,
  normalizeDegrees,
  pointSegmentDistance,
  rotationMatrix,
  toDegrees,
} from "../src/geometry.ts";

// Translates upstream 40kdc "battlemaster-11e" composite layouts into the
// legacy piece vocabulary the rest of this pipeline consumes. Upstream lists
// one composite `area` piece whose parts live in `features[]` on its template;
// this emits the area retemplated onto one of the five legacy archetypes, plus
// one parented `feature` child per part drawn with a legacy part template.
//
// The corrections, by the letters used throughout this file:
//
//   V - a composite's footprint is a rigid transform of its class's archetype,
//       not a copy. `gMap`'s trapezoid branch in area-to-building.mjs is
//       hard-coded to `area-trapezoid`'s orientation, so V is folded into the
//       area's own transform rather than carried as an inline footprint (which
//       mis-places it by ~6in), and folded back out of every child.
//
//   K - a Battlemaster part is a physical model, so its handedness is fixed
//       however its parent is oriented. The legacy `corner-*` polygons are
//       chiral and `featureFromRefs` reads chirality from the *resolved* arms,
//       which a mirrored parent flips. K cancels the parent's parity and applies
//       a per-part flip bit. It is the composition of those two reflections,
//       not one reflection of the same parity: they differ by a half-turn (see
//       the K comment in normalizeLayout).
//
//   Q - seven of the thirteen mapped parts are drawn a quarter- or half-turn
//       apart in the legacy template and upstream. `rotation_degrees` is copied
//       verbatim, so without Q those seven render turned.
//
//   W - a part's model extent, read by `partExtent`. "Upstream's rectangle" in
//       F, Z and S means this.
//
//   F - substitute the legacy footprint only where it says something upstream's
//       plain rectangle does not. For the chiral `corner-*` parts it carries the
//       L shape and wins. Where the legacy footprint is itself a rectangle it
//       adds only a size, and one that disagrees by up to (1.5, 2)in, so those
//       parts (`generator`, `tower`) carry upstream's footprint inline and keep
//       the legacy template id only for the feature type and colour
//       rect-to-feature.mjs reads off it. See PART_TO_TEMPLATE for the two
//       rectangle parts this rule does not reach.
//
//   Z - the legacy `corner-*` polygons are up to 1.25in oversize. Only their
//       bbox reaches the render (ruin-to-feature.mjs reads the outer corner and
//       arm ends; lRuin draws fixed 0.5in walls), so shape and size separate:
//       Z rescales each polygon so that, once Q has turned it into the part's
//       frame, its bbox is upstream's rectangle. With S centring it there, the
//       part stays inside its composite by construction (upstream's parts fit
//       theirs to 0.003in); unscaled, `ab` and `corner` overhang the trapezoid
//       by ~0.1in.
//
//   S - upstream's `position` is the bbox centre of the part; resolvePiece
//       anchors at the area centroid. For the L-shaped `corner-*` polygons those
//       differ by up to (1, 1)in, so S re-anchors by the offset.
//
// Q, S, V and the flip bits were measured against the pre-pull corpus (the
// legacy-vocabulary layouts at f1d98fb, before c1bb2b4 adopted the battlemaster
// source): both draw the same terrain, so the rigid map taking each emitted
// piece onto its pre-pull counterpart reads off the correction. That corpus
// can no longer be regenerated, so battlemaster-registration.test.mjs pins the
// results. W alone is derived from the shipped data.

/**
 * Legacy area archetype for each Battlemaster size class. Every composite's
 * footprint matches its archetype's bounding box to within 0.06in.
 *
 * `LongLineTower` is not a sixth class: one composite
 * (`bm-composite-longlinetower-flip-...`) drops the separator its siblings keep
 * (`bm-composite-longline-tower-...`) in both id and name. Its footprint is a
 * rigid variant of the other LongLine ones.
 */
export const SIZE_CLASS = {
  BigRect: "area-large",
  SmallRect: "area-medium",
  ShortLine: "area-short-line",
  LongLine: "area-long-line",
  LongLineTower: "area-long-line",
  Triangle: "area-trapezoid",
};

// Legacy template for each Battlemaster part, plus:
//
//   `flip` - the part's true handedness is the opposite of the legacy
//            polygon's (K).
//   `turn` - degrees, a multiple of 90, taking the legacy polygon's drawing
//            orientation onto the upstream part's (Q). Always 0 for an
//            `upstreamFootprint` part, which is already in the part's frame.
//   `upstreamFootprint`
//          - emit the upstream part's own footprint instead of the legacy
//            polygon (F).
//   `upstreamSize`
//          - keep the legacy shape, rescaled onto upstream's rectangle (Z).
//            Mutually exclusive with `upstreamFootprint`.
//   `drop` - emit no child for this part.
//
// `turn` and `flip` were measured by matching each emitted child to the
// nearest pre-pull piece of its template and sweeping all four turns and both
// flip bits. Each part has a unique optimum by a wide margin (worst-case ring
// mismatch in inches, mean over matched instances):
//
//   part          turn 0   turn 90   turn 180   turn 270   -> registered
//   ab             3.98      4.25      1.20       3.80        180
//   co             4.37      0.74      4.48       2.54         90
//   ef             4.40      1.03      4.37       4.02         90
//   gh             0.47      4.57      2.60       4.65           0
//   corner         1.71      1.61      1.69       0.57        270
//   small-l        1.72      2.11      0.24       2.07        180
//   small-l-flip   1.52      2.10      0.50       2.02        180
//
// `cd` takes `co`'s row (see its entry). The rectangle and near-symmetric
// parts cannot tell 0 from 180 and are decisively worse at 90/270, so they
// take 0.
//
// Do not use bounding-box aspect ratio as the oracle instead: it is blind to a
// half-turn, undefined for the square parts, and for `ab` prefers the wrong
// answer (90).
//
// Legacy bbox (under its turn) against upstream's rectangle (W), which is what
// F and Z act on. `ab` is read from its PART_CANONICAL drawing; `cd` is `co`.
//
//   part          legacy   upstream   delta
//   ab            5x4.5    3.75x4.5   +1.25  0        L-shaped: legacy polygon
//   ef            4.5x5    4.5x6       0    -1        carries the shape and
//   co            6.5x3    6x2.5      +0.5  +0.5      upstream the size
//   gh            3x6.5    3x6         0    +0.5      -> upstreamSize (Z)
//   corner        2x2      1.5x1.5    +0.5  +0.5
//   small-l       2x3      1.5x2.5    +0.5  +0.5
//   small-l-flip  2x3      1.5x2.5    +0.5  +0.5
//   short-barrier 3.5x1    3.75x0.5   -0.25 +0.5      8-vertex legacy polygon.
//   tower         2x2      2x2.5       0    -0.5      -> upstreamFootprint
//   generator     3x4      4.5x2      -1.5  +2        -> upstreamFootprint
//   long-barrier  5.5x1    4.5x0.5    +1    +0.5      rectangle, but see below
//   pipes         7x2      6x1        +1    +1        rectangle, but see below
//
// The deltas change sign, so no margin convention relates the two sizes; where
// upstream has a usable rectangle, it wins. `short-barrier` keeps its legacy
// polygon because feature-to-building.mjs matches its 8-vertex profile to pick
// the `barricade` template. Two rectangle parts keep theirs too:
//
//   long-barrier - maps onto the `pipe` building template, drawn at its
//     templates-simple.yml size: placement.ts throws if a pinned corner
//     distance disagrees with the template edge by more than 0.1in, and
//     feature-to-building.mjs pins on a 5.5in edge. Adopting upstream's size
//     means redrawing the template, not setting a flag.
//   pipes - maps onto `catwalk`, which layout-to-placements.mjs drops after
//     reading only its centroid; switching it changes no emitted output.
export const PART_TO_TEMPLATE = {
  ab: {
    template: "corner-ruin-balanced-left",
    flip: true,
    turn: 180,
    upstreamSize: true,
  },
  ef: {
    template: "corner-ruin-balanced-right",
    flip: false,
    turn: 90,
    upstreamSize: true,
  },
  co: {
    template: "corner-ruin-left",
    flip: false,
    turn: 90,
    upstreamSize: true,
  },
  gh: {
    template: "corner-ruin-right",
    flip: false,
    turn: 0,
    upstreamSize: true,
  },
  corner: {
    template: "corner-tiny",
    flip: true,
    turn: 270,
    upstreamSize: true,
  },
  "small-l": {
    template: "corner-short",
    flip: true,
    turn: 180,
    upstreamSize: true,
  },
  "small-l-flip": {
    template: "corner-short",
    flip: false,
    turn: 180,
    upstreamSize: true,
  },
  // `cd` is `co` under a second upstream id: footprint, walls, thickness,
  // `has_roof` and category are byte-identical. Identical input must give
  // identical output, so it takes `co`'s registration; a sweep could not choose
  // anyway, since Z resizes every candidate onto the same 6x2.5 rectangle.
  cd: {
    template: "corner-ruin-left",
    flip: false,
    turn: 90,
    upstreamSize: true,
  },
  // Dropped, as layout-to-placements.mjs drops `catwalk`. The only part with no
  // walls (a plain 1x1 square, no roof), used twice in one composite
  // (`bm-composite-bigrect-cd-gh-03-...`) with nothing at that spot in the
  // pre-pull corpus. Emitting it as `corner-tiny` would give
  // `bm-disrupt-vs-assets-02` 18 whole-L ruins against the 16 every mission
  // layout carries (ruin-to-feature.test.mjs). Give it a mapping if upstream
  // grows it a wall or uses it more widely.
  "ruin-part": { drop: true },
  tower: { template: "gantry", flip: false, turn: 0, upstreamFootprint: true },
  generator: {
    template: "generator",
    flip: false,
    turn: 0,
    upstreamFootprint: true,
  },
  "long-barrier": { template: "pipe", flip: false, turn: 0 },
  "short-barrier": { template: "barricade", flip: false, turn: 0 },
  pipes: { template: "catwalk", flip: false, turn: 0 },
};

/** Every field this module reads off a composite's `features[]` entry. */
const FEATURE_KEYS = new Set([
  "id",
  "template",
  "position",
  "rotation_degrees",
  "mirror",
]);

/**
 * Snap a rigid matrix to integers. `rotationMatrix` leaves 1e-17 noise on a
 * quarter-turn, which would leak into `decompose`'s angle and into deep-equals
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
 * the same children). So these were measured against the pre-pull corpus:
 * pair each new area with the nearest pre-pull area of the same archetype
 * (assigned globally within a layout) and read V = M_new^-1 . M_old.
 */
const CLASS_REFERENCE = {
  BigRect: ["bm-composite-bigrect-cd-ef-01-19f1adc57b", "R180"],
  LongLine: ["bm-composite-longline-tower-3be6fa3536", "R0"],
  LongLineTower: ["bm-composite-longlinetower-flip-06c4f02941", "R0.FX"],
  ShortLine: ["bm-composite-shortline-barrier-348db27c93", "R180"],
  SmallRect: ["bm-composite-smallrect-generator-44c45681fa", "R0"],
  Triangle: ["bm-composite-triangle-ab-corner-02-4b8322162e", "R90.FX"],
};

/**
 * Symmetric Hausdorff distance from each ring's vertices to the other ring's
 * *outline*. Vertex-to-vertex comparison fails against upstream's densely
 * traced outlines, where a mid-edge vertex can be inches from the nearest
 * vertex of a coarser ring of the same shape.
 */
const shapeDistance = (a, b) => {
  const toOutline = (ring, other) =>
    Math.max(
      ...ring.map((p) =>
        Math.min(
          ...other.map((_, i) =>
            pointSegmentDistance(p, other[i], other[(i + 1) % other.length]),
          ),
        ),
      ),
    );
  return Math.max(toOutline(a, b), toOutline(b, a));
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
function fitVariant(composite, templatesById) {
  const cls = classOf(composite);
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

/**
 * The rigid variant a composite's footprint is registered at.
 *
 * @param {object} composite - a `bm-composite-` template.
 * @param {Map<string, object>} templatesById - the vendored template table.
 * @returns {number[][]} V, the rigid map the emitted area carries.
 */
function variantOf(composite, templatesById) {
  let fitted = variantCache.get(templatesById);
  if (!fitted) variantCache.set(templatesById, (fitted = new Map()));
  let V = fitted.get(composite.id);
  if (!V) fitted.set(composite.id, (V = fitVariant(composite, templatesById)));
  return V;
}

const COMPOSITE_PREFIX = "bm-composite-";
const PART_PREFIX = "bm-part-";

// Upstream suffixes every template id with a content hash, so
// `bm-part-ab-68b696d07f` and `bm-part-ab-b2b36df6fb` are two drawings of the
// same `ab` model. Stripping it keys PART_TO_TEMPLATE on the model.
const HASH_SUFFIX = /-[0-9a-f]{10}$/;

/**
 * The drawing a part's model is read from, for parts upstream ships more than
 * one drawing of.
 *
 * Both `ab` ids have byte-identical `walls` and differ only in the roof. Since
 * `partExtent` unions roof with walls, a divergent roof gives one model two
 * sizes (4x4.5 against 3.75x4.5 when they last diverged; today both ship the
 * same `footprint`). Geometry alone cannot tell a roof overhanging its walls
 * from a barrier's off-centre centreline, so the choice is registered, like
 * CLASS_REFERENCE. battlemaster-registration.test.mjs fails if another part
 * gains a second drawing without an entry.
 */
export const PART_CANONICAL = {
  ab: "bm-part-ab-68b696d07f",
};

/** The template id a part's model should be read from. See PART_CANONICAL. */
const canonicalPartId = (templateId) =>
  PART_CANONICAL[partOf(templateId)] ?? templateId;

const isCompositeTemplate = (id) =>
  typeof id === "string" && id.startsWith(COMPOSITE_PREFIX);

/** Size class of a composite, read from its name ("Battlemaster BigRect CD GH 01" -> BigRect). */
function classOf(composite) {
  const cls = composite?.name?.split(" ")[1];
  if (!cls || !SIZE_CLASS[cls]) {
    throw new Error(
      `unknown Battlemaster size class for composite ${composite?.id ?? "?"}`,
    );
  }
  return cls;
}

/** Bare part name of a composite feature template id, hash suffix removed. */
function partOf(templateId) {
  const part = templateId.startsWith(PART_PREFIX)
    ? templateId.slice(PART_PREFIX.length).replace(HASH_SUFFIX, "")
    : templateId;
  if (!PART_TO_TEMPLATE[part]) {
    throw new Error(`no legacy template mapping for part ${templateId}`);
  }
  return part;
}

/**
 * `normalizeDegrees` plus a float-noise snap: angles from `atan2` on composed
 * matrices arrive as 89.99999999999999 or just under 360, and would otherwise
 * be written into the emitted corpus verbatim.
 */
const normDeg = (deg) => {
  const r = Math.round(normalizeDegrees(deg) * 1e6) / 1e6;
  return r === 360 ? 0 : r;
};

/**
 * Factor an orthogonal 2x2 back into the `{ rotation_degrees, mirror }` pair
 * resolvePiece consumes, which applies mirror first then rotation (A = R . S).
 * An improper map always comes back as a horizontal mirror; the rotation
 * absorbs the difference between the two mirror axes.
 */
function decompose(A) {
  const improper = det(A) < 0;
  const R = improper ? matmul(A, FLIP_X) : A;
  const out = {
    rotation_degrees: normDeg(toDegrees(Math.atan2(R[1][0], R[0][0]))),
  };
  if (improper) out.mirror = "horizontal";
  return out;
}

function bboxSize(footprint) {
  return boundsSize(footprintPolygon(footprint));
}

/**
 * W: the upstream part's model extent, as the plain rectangle F and Z are
 * calibrated against, read correctly under both schemas upstream has shipped.
 *
 * Currently (since 40kdc-data 39661875) `footprint` is the model extent, the
 * roof lives in `upper_floor` (not read here), and `position` anchors the
 * extent's centre. In the earlier schema `footprint` was only the roofed area
 * (`ab`: 2.5x2.5 of a 3.75x4.5 model), the rest of the model was `walls`
 * centrelines, and `position` anchored the roof's centre.
 *
 * The bbox of the footprint plus the wall centrelines is the extent under
 * both, and reproduces the pre-pull rectangles exactly. Walls alone would not:
 * a barrier's centreline runs along one edge of its footprint, not down the
 * middle. `partAnchorShift` handles the anchor half. A part with no walls
 * falls back to its footprint.
 */
function extentBounds(part) {
  const roof = footprintPolygon(part.footprint);
  const walls = (part.walls ?? []).flatMap((w) => w.points);
  return bounds([...roof, ...walls]);
}

function partExtent(part) {
  if (!part.walls?.length) return part.footprint;
  const b = extentBounds(part);
  return {
    type: "rectangle",
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  };
}

/**
 * W2: the composite-frame correction from a *mirrored* feature's `position` to
 * its roof centre: (I - S) . roofCentre, where S is the feature's mirror alone,
 * raised into the composite frame by the feature's rotation. Zero for an
 * unmirrored feature (903 of 904). Not the full `pieceMatrix`: rotation is not
 * what upstream mis-anchors, and that would fire on all 96 rotated features.
 *
 * One instance ships: the generator in
 * `bm-composite-smallrect-generator-updown-flip-3db57df624`, stored at
 * x = -4.566281. Four independent measurements put it at -0.066281:
 *
 *   - its unmirrored sibling `...-updown-bfbe6a06e7` maps onto it exactly
 *     under x -> 6.003 - x and reads +0.066281;
 *   - the stored value is off by exactly 4.5in, the generator's roof width;
 *   - as stored, it hangs 3.7in outside its own parent outline;
 *   - the pre-pull corpus puts both generators of `bm-purge-vs-recon-01`
 *     4.500in from the uncorrected anchor.
 *
 * No single anchor convention yields both this and the unmirrored case, so it
 * reads as an upstream exporter bug. With one instance this rule cannot be
 * told from one in the roof's *width* (the roof starts at x = 0); a second
 * mirrored part would separate them, and `parts sit inside the composite that
 * contains them` in battlemaster-registration.test.mjs would notice.
 */
function mirrorAnchorFix(part, feature) {
  const roof = boundsCentre(footprintPolygon(part.footprint));
  const reflected = matvec(mirrorMatrix(feature), roof);
  return matvec(rotationMatrix(feature.rotation_degrees ?? 0), {
    x: roof.x - reflected.x,
    y: roof.y - reflected.y,
  });
}

/**
 * Part-frame vector from the footprint centre `position` anchors to the centre
 * of `partExtent`. Zero under the current schema; up to (1.25, 1.5)in for the
 * big L-ruins under the roof-footprint one, where omitting it pushed 270 of
 * 360 children outside their parent. See W.
 */
function partAnchorShift(part) {
  if (!part.walls?.length) return { x: 0, y: 0 };
  const b = extentBounds(part);
  const roof = boundsCentre(footprintPolygon(part.footprint));
  return {
    x: (b.minX + b.maxX) / 2 - roof.x,
    y: (b.minY + b.maxY) / 2 - roof.y,
  };
}

/**
 * Inverse of an orthogonal 2x2, i.e. its transpose. Checked, since a
 * non-orthogonal V would silently mis-anchor every child.
 */
function orthoInverse(A) {
  const T = [
    [A[0][0], A[1][0]],
    [A[0][1], A[1][1]],
  ];
  const P = matmul(A, T);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (Math.abs(P[i][j] - (i === j ? 1 : 0)) > 1e-9) {
        throw new Error(`variant matrix is not orthogonal: ${JSON.stringify(A)}`);
      }
    }
  }
  return T;
}

/**
 * Z: resize a legacy `corner-*` polygon so that, once Q has turned it into the
 * upstream part's frame, its bbox is upstream's rectangle. A quarter-turn
 * swaps which upstream side each legacy axis must reach.
 *
 * The arms keep their 0.5in thickness, matching the fixed wall lRuin draws, so
 * the emitted footprint is the polygon the renderer will draw. Each axis
 * moves only its far side: a coordinate in the near half stays put, one in
 * the far half shifts by the whole size delta. The translation this
 * introduces is absorbed downstream (resolvePiece re-centres, S re-anchors).
 */
function scaleToUpstream(legacy, upstream, turn, part = "?") {
  const ring = footprintPolygon(legacy);
  const l = bboxSize(legacy);
  const u = bboxSize(upstream);
  const quarter = normDeg(turn) === 90 || normDeg(turn) === 270;
  const want = {
    width: quarter ? u.height : u.width,
    height: quarter ? u.width : u.height,
  };
  const { minX, minY } = bounds(ring);
  const move = (v, min, size, delta) => (v - min > size / 2 ? v + delta : v);
  const out = {
    type: "polygon",
    points: ring.map((p) => ({
      x: move(p.x, minX, l.width, want.width - l.width),
      y: move(p.y, minY, l.height, want.height - l.height),
    })),
  };
  // The near/far split only reaches `want` for an axis-aligned L whose arms sit
  // in the near half (all six legacy corners), so measure rather than assume.
  const got = bboxSize(out);
  if (
    Math.abs(got.width - want.width) > 1e-9 ||
    Math.abs(got.height - want.height) > 1e-9
  ) {
    throw new Error(
      `part ${part}: resizing its legacy polygon gave ` +
        `${got.width}x${got.height}, not upstream's ${want.width}x${want.height}`,
    );
  }
  return out;
}

/**
 * S: the part-frame offset re-anchoring a legacy footprint from the area
 * centroid resolvePiece uses onto the bbox centre upstream's `position` means.
 * Zero for every rectangle part, up to (1, 1)in for the L-shaped `corner-*`.
 */
function anchorOffset(footprint) {
  const ring = footprintPolygon(footprint);
  const c = centroid(ring);
  const b = boundsCentre(ring);
  return { x: c.x - b.x, y: c.y - b.y };
}

/** The piece's own mirror, on its own: diag(sx, sy). */
function mirrorMatrix(piece) {
  return piece.mirror === "horizontal"
    ? FLIP_X
    : piece.mirror === "vertical"
      ? FLIP_Y
      : IDENTITY;
}

/** The piece's own linear map: R(rotation_degrees) . diag(sx, sy). */
function pieceMatrix(piece) {
  return matmul(rotationMatrix(piece.rotation_degrees ?? 0), mirrorMatrix(piece));
}

/**
 * Rewrite a Battlemaster composite layout into the legacy piece vocabulary:
 * each `area` piece renamed onto its legacy archetype (with the composite's
 * rigid variant folded into its own transform), plus one parented `feature`
 * child per composite part.
 *
 * Pieces that do not reference a composite template pass through untouched, so
 * a layout that predates the battlemaster re-source is returned as-is.
 *
 * @param {object} layout - a 40kdc layout ({ id, pieces, ... }).
 * @param {Map<string, object>} templatesById - the vendored template table.
 * @returns {object} a new layout with a rewritten `pieces` array.
 */
export function normalizeLayout(layout, templatesById) {
  const pieces = [];
  for (const piece of layout.pieces) {
    if (!isCompositeTemplate(piece.template)) {
      pieces.push(piece);
      continue;
    }
    const composite = templatesById.get(piece.template);
    if (!composite) {
      throw new Error(`layout ${layout.id} references missing template ${piece.template}`);
    }
    const V = variantOf(composite, templatesById);
    // The parent area carries M . V, so every child starts by undoing V, in
    // orientation and anchor. Not every variant is self-inverse (the `-flip`
    // Triangle registers R270), so this is the real inverse.
    const Vinv = orthoInverse(V);
    const M = pieceMatrix(piece);

    const area = { ...piece, template: SIZE_CLASS[classOf(composite)] };
    delete area.mirror;
    // Composite pieces carry no inline footprint today, but upstream uses them
    // elsewhere (kotc-colosseum). Retemplating would silently split it:
    // areaBuildingPlacement reads the archetype template while resolvePiece
    // prefers `piece.footprint`, so the area and its children would disagree.
    if (piece.footprint) {
      throw new Error(
        `piece ${piece.id} carries an inline footprint; composite retemplating to ${area.template} would discard it`,
      );
    }
    Object.assign(area, decompose(matmul(M, V)));
    pieces.push(area);

    for (const feature of composite.features ?? []) {
      // Any field outside FEATURE_KEYS would be dropped silently: an inline
      // `footprint` would lose to the template's under F/Z, and an unread
      // `mirror` would emit the wrong chirality.
      for (const key of Object.keys(feature)) {
        if (!FEATURE_KEYS.has(key)) {
          throw new Error(
            `composite ${piece.template} feature ${feature.id} carries unhandled field \`${key}\`; normalization would drop it`,
          );
        }
      }
      // A feature-level `mirror` expresses the other hand of a part; it is the
      // same `{ rotation, mirror }` pair a piece carries.
      const Mf = pieceMatrix(feature);
      const part = partOf(feature.template);
      const { template, flip, turn, upstreamFootprint, upstreamSize, drop } =
        PART_TO_TEMPLATE[part];
      if (drop) continue;
      const legacy = templatesById.get(template);
      // Not `feature.template`: where upstream draws one model twice, every
      // drawing of it emits from the registered one. See PART_CANONICAL.
      const upstreamId = canonicalPartId(feature.template);
      const upstream = templatesById.get(upstreamId);
      for (const [id, t] of [
        [template, legacy],
        [upstreamId, upstream],
      ]) {
        if (!t) {
          throw new Error(
            `layout ${layout.id} maps part ${part} onto missing template ${id}`,
          );
        }
      }
      // F/Z: upstream's rectangle (W) outright, the legacy L rescaled onto it,
      // or the legacy polygon untouched for the three parts neither reaches.
      const extent = partExtent(upstream);
      const footprint = upstreamFootprint
        ? extent
        : upstreamSize
          ? scaleToUpstream(legacy.footprint, extent, turn, part)
          : legacy.footprint;
      // K = P . F: P cancels every improper map above the part (the parent's
      // mirror and the feature's own), F applies the part's flip bit. Do not
      // collapse them to `improper ? FLIP_X : IDENTITY`: that has the right
      // parity, but since FLIP_Y = R(180) . FLIP_X it drops a half-turn under
      // a mirrored parent (44 of 44 such `small-l-flip` 180 degrees out against
      // the pre-pull corpus).
      const P = det(matmul(M, Mf)) < 0 ? FLIP_Y : IDENTITY;
      const F = flip ? FLIP_X : IDENTITY;
      const K = matmul(P, F);
      // Q sits inside K because the flip axis was calibrated in the part's
      // frame. The order matters only for a flip bit with a quarter-turn
      // (`corner` alone), where the pre-pull corpus prefers this order by
      // 51/68 exact matches against 2/68.
      const A = matmul(matmul(Vinv, Mf), matmul(K, rotationMatrix(turn)));
      // S goes through the full map A: it re-anchors the polygon as finally
      // oriented, not as drawn. Zero for a rectangle.
      const S = matvec(A, anchorOffset(footprint));
      // Undo V so the child lands at M . feature.position whatever the
      // variant. `shift` steps from the footprint centre to the extent centre
      // (W); `fix` corrects a mirrored feature's anchor (W2).
      const shift = matvec(Mf, partAnchorShift(upstream));
      const fix = mirrorAnchorFix(upstream, feature);
      const anchor = matvec(Vinv, {
        x: feature.position.x + fix.x + shift.x,
        y: feature.position.y + fix.y + shift.y,
      });
      const child = {
        id: `${piece.id}-${feature.id}`,
        name: feature.id,
        piece_type: "feature",
        template,
        // resolvePiece prefers an inline footprint, while the downstream
        // converters key feature type and colour off `template`.
        ...(upstreamFootprint || upstreamSize ? { footprint } : {}),
        parent_area_id: piece.id,
        position: { x: anchor.x + S.x, y: anchor.y + S.y },
        ...decompose(A),
      };
      pieces.push(child);
    }
  }
  return { ...layout, pieces };
}
