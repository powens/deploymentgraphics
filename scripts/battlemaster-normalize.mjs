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
  rotationMatrix,
  toDegrees,
} from "../src/geometry.ts";

// Translates upstream 40kdc "battlemaster-11e" composite layouts back into the
// legacy piece vocabulary the rest of this pipeline was built for.
//
// Upstream re-sourced the 11e Chapter Approved terrain from Battlemaster's TTS
// Map API. Where a layout used to list an `area` piece plus a handful of
// `feature` children (corner ruins, pipes, generators), it now lists only the
// area, and the children live in a `features[]` array on the *template*. The
// whole migration is a vocabulary rewrite: emit the same pieces the old data
// would have carried, and nothing downstream changes.
//
// A later re-source under the same `battlemaster-11e` name renamed every id
// (composites and parts both, each now carrying a content hash), renamed the
// five size classes from initialisms to words, replaced the `mirror` flag a
// layout piece used to carry with separate mirrored composite templates,
// re-traced every composite footprint at 167-348 vertices where it used to ship
// a copy of one of the five legacy archetypes, and split each part's `footprint`
// into a roof plus a set of `walls`. What did *not* change is the pipeline
// downstream of this module: the emitted corpus still uses the same five
// archetypes and the same legacy part templates, in the same counts.
//
// Several subtleties make this more than a lookup table:
//
//   V - a composite's footprint is a rigid transform of its class's, rather than
//       a copy of it. `gMap`'s trapezoid branch in area-to-building.mjs is
//       hard-coded to `area-trapezoid`'s orientation, so the variant has to be
//       folded into the piece's own transform instead of carried as an inline
//       footprint (which mis-places it by ~6in). It is folded back out of every
//       child, so a child's placement does not depend on V at all.
//
//   K - a Battlemaster part is a physical model, so its handedness is fixed no
//       matter how its parent composite is oriented. The legacy `corner-*`
//       polygons are chiral and `featureFromRefs` reads chirality from the
//       *resolved* arms, which a parent's `mirror: horizontal` flips. K cancels
//       the parent's parity and applies a per-part flip bit so each part always
//       renders as the same l-ruin variant. It is the composition of those two
//       reflections, not a single one chosen to match their parity: the two
//       agree on handedness but differ by a half-turn, so collapsing them turns
//       the part (see the comment at the K in normalizeLayout).
//
//   Q - the legacy template and the upstream part are two drawings of the same
//       physical model, but not always in the same orientation: seven of the
//       thirteen mapped parts are drawn a quarter- or half-turn apart.
//       `rotation_degrees` is copied from upstream verbatim, so without Q those
//       seven render turned.
//
//   W - a part's model extent, which upstream stopped shipping directly: its
//       `footprint` is now the roofed area, and the rest of the model lives in
//       `walls`. F, Z and S below all mean the extent wherever they say
//       "upstream's rectangle", and `partExtent` is what reconstructs it. See
//       that function for why it is the union of the two and not either alone,
//       and for the anchor half of the same change.
//
//   F - substituting the legacy footprint is only sound where that polygon says
//       something upstream's does not. Upstream's own drawing of a part is a
//       plain rectangle (W), so for the chiral `corner-*` parts the legacy
//       polygon is
//       carrying the whole L shape and must win. But where the legacy footprint
//       is *itself* a plain rectangle it adds no shape at all, only a size -
//       and the sizes disagree, by up to (1.5, 2)in. There the substitution can
//       only ever be a worse-measured version of upstream's own rectangle, so
//       those parts (`generator`, `tower`) carry upstream's footprint inline
//       and keep the legacy template id purely for the feature type and colour
//       rect-to-feature.mjs reads off it. See PART_TO_TEMPLATE for the two
//       rectangle parts this rule does *not* reach.
//
//   Z - F keeps the legacy polygon's *shape* for the `corner-*` parts, but its
//       size was never upstream's either: those polygons are drawn up to 1.25in
//       out (see the delta table below). Only the bounding box survives into the
//       render - ruin-to-feature.mjs reads the outer corner and the two arm ends
//       and nothing else, and lRuin draws its walls a fixed 0.5in thick - so the
//       L shape and the size are separable, and there is no reason to take the
//       size from the worse source. Z rescales each legacy polygon so that, once
//       Q has turned it into the part's frame, its bbox *is* upstream's
//       rectangle. That buys containment by construction rather than by
//       measurement: upstream's parts sit inside their composite to within
//       0.003in, S already pins our bbox centre on upstream's rectangle centre,
//       so a bbox equal to that rectangle cannot leave the parent. Without Z the
//       oversize `ab` and `corner` hung 0.13in and 0.11in outside the trapezoid
//       composite, which has no slack at its slanted edge to absorb them.
//
//   S - upstream anchors `position` at the centre of the part's own footprint,
//       which for a rectangle is both its bbox centre and its area centroid.
//       resolvePiece anchors at the area centroid, and the legacy `corner-*`
//       polygons are L-shaped, so their centroid sits up to (1, 1)in inside
//       their bbox centre. S re-anchors the substituted polygon by that offset,
//       otherwise every L-shaped part lands ~1in off upstream's placement.
//       Since the re-source that footprint is the *roof*, so the point S has to
//       land on is `partAnchorShift` away from `position` rather than on it.
//
// Q, S, V and the flip bits are all measured against the pre-pull corpus (the
// legacy-vocabulary layouts this repo shipped at f1d98fb, immediately before
// c1bb2b4 adopted the battlemaster source). Both corpora draw the same physical
// terrain, so for each part the rigid map taking our emitted piece onto the
// pre-pull piece is a direct read-out of the correction. See
// battlemaster-registration.test.mjs for what is pinned and how.
//
// W is the one correction *not* measured that way, and does not need to be: it
// is derived from the shipped data and checked against the pre-pull rectangles,
// which it reproduces exactly. That is what let the rest of this calibration
// survive the re-source untouched.

/**
 * Legacy area template for each Battlemaster size class.
 *
 * Upstream renamed the classes from initialisms (`BR`/`SR`/`SL`/`LL`/`TR`) to
 * words in the battlemaster-11e re-source; the mapping onto the five legacy
 * archetypes is unchanged, and each class's composite footprints still match
 * their archetype's bounding box to within 0.06in.
 *
 * `LongLineTower` is upstream's own inconsistency, not a sixth class: one
 * composite (`bm-composite-longlinetower-flip-...`) drops the separator its two
 * siblings keep (`bm-composite-longline-tower-...`), in both its id and its
 * name. Its footprint is a rigid variant of the other LongLine ones, so it maps
 * onto the same archetype.
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
//   `flip` - whether the part's true handedness is the opposite of the legacy
//            polygon's own (see K above).
//   `turn` - the quarter-turn taking the legacy polygon's drawing orientation
//            onto the upstream part's (see Q above). Degrees, always a multiple
//            of 90. Necessarily 0 for an `upstreamFootprint` part, which is
//            already drawn in the upstream part's own frame.
//   `upstreamFootprint`
//          - carry the upstream part's own footprint on the emitted child
//            rather than substituting the legacy polygon (see F above).
//   `upstreamSize`
//          - keep the legacy polygon's shape but rescale it onto the upstream
//            part's rectangle (see Z above). Mutually exclusive with
//            `upstreamFootprint`; both emit an inline footprint.
//
// Both are measured against the pre-pull corpus: emit each child, match it to
// the nearest pre-pull piece of the mapped template, and read off the rigid map
// between the two. Sweeping each part over all four turns and both flip bits
// picks a unique optimum per part, by a wide margin over the runners-up
// (worst-case ring mismatch vs the pre-pull piece, mean over matched instances):
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
// `cd` is absent from that table because it needs no sweep of its own: it is
// byte-identical to `co` upstream (see its entry below) and takes `co`'s row.
//
// The four parts absent for the original reason (tower, long-barrier,
// short-barrier, pipes) map onto rectangles or a near-symmetric barricade, where
// 0 and 180 are indistinguishable and 90/270 are decisively worse; they take
// turn 0.
//
// `generator` and `tower` are absent for a different reason: they take
// upstream's own footprint, so they have no legacy drawing to re-orient and
// their turn is 0 by construction. (Sweeping `generator` against the pre-pull
// corpus while it still used the legacy polygon read 0.20in at 90/270 against
// 0.88in at 0/180 - the pre-pull generator is landscape, as upstream's 4.5x2 is
// - but 0.20in was the floor, because a 4x3 stand-in cannot sit on a 4.5x2
// model exactly.)
//
// Legacy bbox (under its turn) against the upstream part's rectangle (W), which
// is what F above is reading. `cd` is omitted: it is `co`'s row exactly.
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
// The deltas are not a consistent margin convention (they run from -1.5 to
// +1.25 and change sign), so there is no rule here that would let a legacy size
// stand in for an upstream one; where upstream has a usable rectangle, it wins.
// `short-barrier` is the one part whose polygon is neither a rectangle nor a
// bbox-only consumer - feature-to-building.mjs matches its 8-vertex profile to
// pick the `barricade` template - so Z cannot reach it either.
//
// The two rectangle parts that keep their legacy footprint anyway:
//
//   long-barrier - maps onto the `pipe` *building* template, and a building is
//     drawn at its templates-simple.yml size, not at its piece's: placement.ts
//     throws if the pinned corner distance disagrees with the template edge by
//     more than 0.1in, and feature-to-building.mjs pins on a 5.5in edge that a
//     4.5x0.5 rectangle does not have. Adopting upstream's size here means
//     redrawing the gw template, not setting a flag.
//   pipes - maps onto `catwalk`, which layout-to-placements.mjs drops; all it
//     uses is the resolved centroid, which is the piece's `position` either
//     way. Measured: switching it changes 0 of 900 features and 0 of 270
//     buildings, and leaves the roofed count at 20. Left alone as churn.
//
// A bounding-box aspect ratio is NOT a valid oracle here and must not be used as
// one: it is blind to a half-turn (`ab`, `small-l`, `small-l-flip` all measure
// 180 while their aspect is unchanged), it is undefined for the square parts
// (`corner`, `tower`), and for `ab` it actively prefers the wrong answer (90).
// The legacy polygons are drawn a little larger than the upstream rectangles, so
// aspect never matches exactly even when the orientation is right.
//
// The same sweep confirms every flip bit independently, each by a wide margin,
// including the `ab` / `ef` / `co` / `gh` bits that previously rested on a
// visual spot-check alone.
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
  // `cd` is not a new model: its footprint, its walls, its thickness, its
  // `has_roof` and its terrain category are all byte-identical to `co`'s, and
  // the two ids together are used exactly as often as `co` alone was before the
  // re-source (20 + 72 = 92). Upstream simply issues two ids ("Battlemaster CO"
  // and "Battlemaster CD") for one piece of terrain. Identical input has to
  // produce identical output, so it takes `co`'s registration outright rather
  // than a sweep of its own - and a sweep could not have chosen anyway, since Z
  // resizes every candidate legacy L onto the same 6x2.5 rectangle and all
  // twelve template/turn/flip combinations tie to the last decimal.
  cd: {
    template: "corner-ruin-left",
    flip: false,
    turn: 90,
    upstreamSize: true,
  },
  // The one part upstream ships that this pipeline deliberately drops, the way
  // layout-to-placements.mjs drops `catwalk`.
  //
  // It is the only part with *no walls at all* - a plain 1x1 dense square, no
  // `has_roof` - so it is not a ruin in the sense the rest of this table means,
  // and partExtent has no extent to read for it. Two uses in the whole corpus,
  // both in one composite (`bm-composite-bigrect-cd-gh-03-...`), and nothing
  // stands where they land in the pre-pull corpus (nearest ring 4.27in away,
  // against 0.00in for a part that genuinely corresponds).
  //
  // What settles it is a corpus invariant this repo already pins: every mission
  // layout carries exactly 16 whole-L ruins (ruin-to-feature.test.mjs). Emitting
  // this fragment as the nearest legacy ruin - `corner-tiny`, drawn at
  // upstream's own 1x1 - gives `bm-disrupt-vs-assets-02` eighteen, and no other
  // layout. A wall-less 1x1 fragment is not a seventeenth ruin, and inventing
  // one to carry it would put a lone layout out of step with the other 44. If a
  // future pull grows this part a wall, or spreads it across the corpus the way
  // a real piece of terrain would be, that is the point to give it a mapping
  // rather than a drop.
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
export const FEATURE_KEYS = new Set([
  "id",
  "template",
  "position",
  "rotation_degrees",
  "mirror",
]);

/** Rotation by 180 degrees. */
const ROT_180 = [
  [-1, 0],
  [0, -1],
];
/** Rotation by 270 degrees. */
const ROT_270 = [
  [0, 1],
  [-1, 0],
];
/** Reflection in the line y = -x. */
const FLIP_ANTIDIAG = [
  [0, -1],
  [-1, 0],
];

// Composites whose footprint is a rigid transform of their archetype rather
// than a copy of it. Everything absent from this table takes the identity.
//
// V's only job is orienting the area: a child's placement is independent of it.
// `normalizeLayout` folds V into the parent's own transform and takes it back
// out of the child's anchor, so the two cancel and the emitted child lands at
// `M . feature.position` whatever V is. What V does control is which way round
// the legacy archetype polygon is drawn once it stands in for the composite.
//
// The battlemaster-11e re-source made these underivable from the shipped
// footprints. Upstream now ships each composite as an individually traced
// outline of 167-348 vertices rather than a copy of one of five archetype
// polygons, so a composite footprint no longer equals its archetype under any
// rigid map - it only resembles it, to ~0.4in, which is far too loose to pick an
// orientation: `area-large` and `area-medium` are near-centrosymmetric, and
// fitting them to their composites prefers the wrong answer outright (it reads
// R180.FX for SmallRect#8 where the corpus says R0, unanimously).
//
// So V is measured against the pre-pull corpus instead, the same oracle
// PART_TO_TEMPLATE is calibrated against. Pair each new area with the pre-pull
// area of the same archetype nearest it (globally assigned within a layout, not
// independently nearest), and V is read straight off the two transforms as
// M_new^-1 . M_old. Grouping the votes by *footprint* rather than by composite
// id is what makes this well-conditioned - V is a property of the shape, and 52
// composites share just 13 distinct footprints, so each one is decided by 14 to
// 130 votes. Eleven of the thirteen come out unanimous or near it (the handful
// of dissenting votes are all pieces upstream genuinely moved, which pair
// against the wrong neighbour).
//
// The two footprints with no tight pairing at all are fixed structurally, off a
// sibling of the same class whose V the corpus did decide. Vertex-for-vertex the
// traced outlines never coincide - they are sampled independently - but as
// *shapes* they are exact rigid transforms of one another, so the map between
// them is unambiguous:
//
//   SmallRect#10 = R0     . SmallRect#8   (Hausdorff 0.0000, next best 1.5173)
//   Triangle#12  = FLIP_X . Triangle#11   (Hausdorff 0.0000, next best 3.8794)
//
// Triangle#12 is the first registered variant that is *not* self-inverse: it
// composes a reflection onto a reflection, which lands on a rotation (R270).
// The child anchoring below uses a real inverse rather than assuming V is its
// own, which is what the header of that line always said would be needed.
export const VARIANT = {
  // BigRect#1 - the five `-flip` BigRect composites.
  "bm-composite-bigrect-cd-gh-03-9d5528f061": FLIP_Y,
  "bm-composite-bigrect-cd-l-02-flip-863010bdd5": FLIP_Y,
  "bm-composite-bigrect-cd-l-03-flip-d35d59fe95": FLIP_Y,
  "bm-composite-bigrect-ef-gh-mirror-flip-79be9885fc": FLIP_Y,
  "bm-composite-bigrect-ef-l-02-flip-9d4ca9e228": FLIP_Y,
  // BigRect#0 - every other BigRect.
  "bm-composite-bigrect-cd-ef-01-19f1adc57b": ROT_180,
  "bm-composite-bigrect-cd-gh-01-3f00cdfa8b": ROT_180,
  "bm-composite-bigrect-cd-gh-01-f1e4a03d8a": ROT_180,
  "bm-composite-bigrect-cd-gh-02-272b53a6a4": ROT_180,
  "bm-composite-bigrect-cd-gh-03-flip-5f30503b64": ROT_180,
  "bm-composite-bigrect-cd-gh-04-823e332c40": ROT_180,
  "bm-composite-bigrect-cd-gh-05-9ebcea9273": ROT_180,
  "bm-composite-bigrect-cd-l-02-0d75b41c2b": ROT_180,
  "bm-composite-bigrect-cd-l-02-8b8eb18e6f": ROT_180,
  "bm-composite-bigrect-cd-l-02-mirror-c90a3ee89b": ROT_180,
  "bm-composite-bigrect-cd-l-02-mirror-cb9fd65589": ROT_180,
  "bm-composite-bigrect-cd-l-03-8bb0fcfdad": ROT_180,
  "bm-composite-bigrect-cd-l-03-ce9e1884e5": ROT_180,
  "bm-composite-bigrect-cd-l-05-bbbfc327bb": ROT_180,
  "bm-composite-bigrect-cd-l-06-e20c53cbac": ROT_180,
  "bm-composite-bigrect-cd-l-a7a8f506b4": ROT_180,
  "bm-composite-bigrect-cd-l-ccb5d722cd": ROT_180,
  "bm-composite-bigrect-ef-gh-02-ca83578212": ROT_180,
  "bm-composite-bigrect-ef-gh-03-1e21a93573": ROT_180,
  "bm-composite-bigrect-ef-gh-ecc366e9dd": ROT_180,
  "bm-composite-bigrect-ef-gh-mirror-a5036a736e": ROT_180,
  "bm-composite-bigrect-ef-l-01-2a7c66398d": ROT_180,
  "bm-composite-bigrect-ef-l-02-a52cc09067": ROT_180,
  "bm-composite-bigrect-ef-l-03-8d5601d88e": ROT_180,
  "bm-composite-bigrect-gh-l-01-65c8a762be": ROT_180,
  // LongLineTower#4 - upstream's odd-one-out id, and the only flipped LongLine.
  "bm-composite-longlinetower-flip-06c4f02941": FLIP_X,
  // ShortLine#5 / #7.
  "bm-composite-shortline-barrier-348db27c93": ROT_180,
  "bm-composite-shortline-barrier-c8ee187515": ROT_180,
  "bm-composite-shortline-barrier-e331c77b59": ROT_180,
  "bm-composite-shortline-pipe-14782bdeaa": ROT_180,
  // ShortLine#6 - the `-flip` pair.
  "bm-composite-shortline-barrier-flip-f253144faf": FLIP_Y,
  "bm-composite-shortline-pipe-flip-b222534f1a": FLIP_Y,
  // SmallRect#9 - the `-flip` trio. (SmallRect#8 and #10 take the identity.)
  "bm-composite-smallrect-generator-flip-cb6b7111f9": FLIP_X,
  "bm-composite-smallrect-generator-updown-flip-3db57df624": FLIP_X,
  "bm-composite-smallrect-l-flip-1c67923cb7": FLIP_X,
  // Triangle#11, then #12 - the one non-self-inverse variant.
  "bm-composite-triangle-ab-corner-02-4b8322162e": FLIP_ANTIDIAG,
  "bm-composite-triangle-ab-corner-02-8d39f1ed78": FLIP_ANTIDIAG,
  "bm-composite-triangle-ab-corner-dcd1586dce": FLIP_ANTIDIAG,
  "bm-composite-triangle-ab-corner-flip-e300f1fbc2": ROT_270,
};

const COMPOSITE_PREFIX = "bm-composite-";
const PART_PREFIX = "bm-part-";

// Upstream now suffixes every template id with a content hash, so a part's id
// no longer names it on its own: `bm-part-ab-68b696d07f` and
// `bm-part-ab-b2b36df6fb` are two footprint variants of the same `ab` model and
// must map onto the same legacy template. The hash is what makes the id table
// churn on a re-pull, and stripping it is what keeps PART_TO_TEMPLATE keyed on
// the model rather than on the drawing.
const HASH_SUFFIX = /-[0-9a-f]{10}$/;

/** True for an upstream Battlemaster composite area template. */
export const isCompositeTemplate = (id) =>
  typeof id === "string" && id.startsWith(COMPOSITE_PREFIX);

/** Size class of a composite, read from its name ("Battlemaster BigRect CD GH 01" -> BigRect). */
export function classOf(composite) {
  const cls = composite?.name?.split(" ")[1];
  if (!cls || !SIZE_CLASS[cls]) {
    throw new Error(
      `unknown Battlemaster size class for composite ${composite?.id ?? "?"}`,
    );
  }
  return cls;
}

/** Bare part name of a composite feature template id, hash suffix removed. */
export function partOf(templateId) {
  const part = templateId.startsWith(PART_PREFIX)
    ? templateId.slice(PART_PREFIX.length).replace(HASH_SUFFIX, "")
    : templateId;
  if (!PART_TO_TEMPLATE[part]) {
    throw new Error(`no legacy template mapping for part ${templateId}`);
  }
  return part;
}

/**
 * `normalizeDegrees` plus a float-noise snap. The angles here come out of
 * `atan2` on composed matrices, so an exact quarter-turn arrives as
 * 89.99999999999999 or as a hair under 360 — either of which would be written
 * into the emitted corpus verbatim. The renderer's own normalisation has no
 * such problem and stays exact.
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
export function decompose(A) {
  const improper = det(A) < 0;
  const R = improper ? matmul(A, FLIP_X) : A;
  const out = {
    rotation_degrees: normDeg(toDegrees(Math.atan2(R[1][0], R[0][0]))),
  };
  if (improper) out.mirror = "horizontal";
  return out;
}

/** Width and height of a footprint's axis-aligned bounding box. */
export function bboxSize(footprint) {
  return boundsSize(footprintPolygon(footprint));
}

/**
 * W: the upstream part's *model extent* and its anchor, as the plain rectangle
 * F and Z are calibrated against.
 *
 * The battlemaster-11e re-source changed what a part's `footprint` means, and
 * changed it in two ways that have to be undone together.
 *
 * It used to be the model's extent - the rectangle the whole calibration below
 * was measured against. It is now the part's *roofed* area, which for an
 * L-shaped ruin is one corner of that rectangle and nothing like it: `ab` reads
 * 2.5x2.5 where its model is 3.75x4.5. The rest of the extent moved into
 * `walls`, a polyline per wall with a thickness. Taking the union of the roof
 * polygon and the wall centrelines puts it back: that bounding box reproduces
 * the pre-re-source rectangle *exactly* for twelve of the thirteen parts that
 * have a pre-pull counterpart, and the thirteenth is a second, slightly wider
 * drawing of `ab` that upstream added in the same pull. Note it is the union
 * that does this and not the walls alone - a barrier's centreline runs along one
 * edge of its footprint rather than down its middle, so walls alone would lose
 * the barrier's whole 0.5in depth (and, worse, shift its centre by half of it).
 *
 * That exactness is what lets every `turn`, every flip bit, and both the F and Z
 * rules carry across the re-source unchanged rather than being re-derived;
 * `battlemaster-registration.test.mjs` pins the twelve rectangles so a later pull
 * cannot quietly move one.
 *
 * The second change is the anchor, and it is the one that is invisible until you
 * measure containment. `position` still means the centre of the footprint - but
 * the footprint is now the roof, so `position` now anchors the *roof's* centre
 * where it used to anchor the extent's. For the six parts whose roof is centred
 * on their extent (`corner`, `small-l`, `small-l-flip`, `generator`, `tower`,
 * `pipes`, and both barriers) that is the same point and nothing changes. For
 * the five big L-ruins it is not: the offset runs to (1.25, 1.5)in, and anchoring
 * an extent-sized L on the roof's centre pushed 270 of 360 children up to 1.25in
 * outside their own parent - outside upstream's composite outline, not merely
 * outside the coarse legacy archetype. `partAnchorShift` is that offset.
 *
 * A part with no walls at all (`ruin-part`, which this module drops) has no
 * extent to read and falls back to its own footprint.
 */
function extentBounds(part) {
  const roof = footprintPolygon(part.footprint);
  const walls = (part.walls ?? []).flatMap((w) => w.points);
  return bounds([...roof, ...walls]);
}

/** The upstream part's extent, as a plain rectangle. */
export function partExtent(part) {
  if (!part.walls?.length) return part.footprint;
  const b = extentBounds(part);
  return {
    type: "rectangle",
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  };
}

/**
 * The part-frame vector from the roof centre `position` anchors to the centre of
 * the extent `partExtent` returns. Zero for every part whose roof is centred on
 * its model; up to (1.25, 1.5)in for the big L-ruins. See W above.
 */
export function partAnchorShift(part) {
  if (!part.walls?.length) return { x: 0, y: 0 };
  const b = extentBounds(part);
  const roof = boundsCentre(footprintPolygon(part.footprint));
  return {
    x: (b.minX + b.maxX) / 2 - roof.x,
    y: (b.minY + b.maxY) / 2 - roof.y,
  };
}

/**
 * Inverse of an orthogonal 2x2. Every registered variant is a rotation or a
 * reflection, so the transpose is the inverse - but check rather than assume,
 * since a non-orthogonal V would make the child anchoring below silently wrong.
 */
export function orthoInverse(A) {
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
 * upstream part's frame, its bounding box is the upstream rectangle (see Z in
 * the header). A quarter-turn swaps which upstream side each legacy axis has to
 * reach, which is the only thing `turn` contributes here.
 *
 * The arms keep their thickness instead of scaling with the box. That thickness
 * is a rendering convention - `lRuin` draws a fixed 0.5in wall whatever the box
 * - not something upstream's solid rectangle has an opinion about, and holding
 * it fixed keeps the emitted footprint identical to the polygon the renderer
 * will draw from it. So each axis moves only its far side: a coordinate in the
 * near half stays put, one in the far half shifts by the whole size delta.
 * Every legacy corner polygon is an axis-aligned L with 0.5in arms (measured, 6
 * of 6), so this takes {0, t, W} to {0, t, W'} for an arm on the near side and
 * {0, W-t, W} to {0, W'-t, W'} for one on the far side.
 *
 * Resizing about the polygon's own origin is enough: resolvePiece re-centres on
 * the centroid and S then re-anchors onto the bbox centre, so the translation
 * this introduces is absorbed downstream.
 */
export function scaleToUpstream(legacy, upstream, turn, part = "?") {
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
  // The near/far split only lands the box on `want` for a polygon whose every
  // vertex sits on a box edge or an arm within the near half - true of all six
  // legacy corner Ls. Anything else (a redrawn upstream part, a new mapping)
  // silently resizes to something other than upstream's rectangle, so measure
  // rather than assume.
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
export function anchorOffset(footprint) {
  const ring = footprintPolygon(footprint);
  const c = centroid(ring);
  const b = boundsCentre(ring);
  return { x: c.x - b.x, y: c.y - b.y };
}

/** The piece's own linear map: R(rotation_degrees) . diag(sx, sy). */
export function pieceMatrix(piece) {
  const S =
    piece.mirror === "horizontal"
      ? FLIP_X
      : piece.mirror === "vertical"
        ? FLIP_Y
        : IDENTITY;
  return matmul(rotationMatrix(piece.rotation_degrees ?? 0), S);
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
    const V = VARIANT[piece.template] ?? IDENTITY;
    // The parent area carries M . V, so everything hung off it has to start by
    // undoing V - the child's orientation as well as its anchor. Both used to
    // apply V itself, which is the same thing only while every registered
    // variant is self-inverse; Triangle#12 is not (see VARIANT).
    const Vinv = orthoInverse(V);
    const M = pieceMatrix(piece);

    const area = { ...piece, template: SIZE_CLASS[classOf(composite)] };
    delete area.mirror;
    // Upstream does use inline piece footprints elsewhere (kotc-colosseum), so
    // this is live schema, just not on composite pieces today. If a future
    // pull attaches one here, retemplating to the archetype would silently
    // discard it: areaBuildingPlacement reads `piece.template` (the
    // archetype) while resolvePiece prefers `piece.footprint` (the
    // composite's own polygon) over the template, so the area would render
    // from one polygon while its children parent through another. Throw
    // instead of silently dropping it.
    if (piece.footprint) {
      throw new Error(
        `piece ${piece.id} carries an inline footprint; composite retemplating to ${area.template} would discard it`,
      );
    }
    Object.assign(area, decompose(matmul(M, V)));
    pieces.push(area);

    for (const feature of composite.features ?? []) {
      // Only the FEATURE_KEYS fields are read below, so anything else upstream
      // adds to a feature would be dropped in silence - and the silent cases
      // are the dangerous ones. This guard has already earned itself once:
      // `mirror` is the natural way for upstream to express the other hand of a
      // part and is exactly the axis K controls, so when upstream started
      // shipping one, a dropped `mirror` would have emitted a child of the wrong
      // chirality while every test still passed (the registration test
      // recomputes K from the same rule, so it would have agreed with the bug).
      // It throws instead, which is what forced K to account for it. An inline
      // `footprint` would likewise lose to the template's under F/Z. Fail loudly,
      // the way the piece-level guards above and the size-class and part lookups
      // below already do.
      for (const key of Object.keys(feature)) {
        if (!FEATURE_KEYS.has(key)) {
          throw new Error(
            `composite ${piece.template} feature ${feature.id} carries unhandled field \`${key}\`; normalization would drop it`,
          );
        }
      }
      // Upstream now expresses the other hand of a part with a feature-level
      // `mirror` (one composite carries one today), which the guard above used
      // to reject outright. It is the same `{ rotation, mirror }` pair a piece
      // carries, so it reads through pieceMatrix and rides in wherever the
      // feature's bare rotation used to.
      const Mf = pieceMatrix(feature);
      const part = partOf(feature.template);
      const { template, flip, turn, upstreamFootprint, upstreamSize, drop } =
        PART_TO_TEMPLATE[part];
      // A part registered as `drop` has no legacy counterpart and is left out of
      // the emitted corpus entirely - see its entry in PART_TO_TEMPLATE.
      if (drop) continue;
      const legacy = templatesById.get(template);
      const upstream = templatesById.get(feature.template);
      for (const [id, t] of [
        [template, legacy],
        [feature.template, upstream],
      ]) {
        if (!t) {
          throw new Error(
            `layout ${layout.id} maps part ${part} onto missing template ${id}`,
          );
        }
      }
      // F/Z: upstream's rectangle outright where the legacy polygon is itself a
      // rectangle, the legacy polygon rescaled onto that rectangle where its L
      // shape is load-bearing, and the legacy polygon untouched for the three
      // parts neither rule reaches.
      // W: the extent F and Z are calibrated against now lives in the part's
      // `walls`, not its `footprint` - see partExtent.
      const extent = partExtent(upstream);
      const footprint = upstreamFootprint
        ? extent
        : upstreamSize
          ? scaleToUpstream(legacy.footprint, extent, turn, part)
          : legacy.footprint;
      // K does two separate jobs, and they have to be composed rather than
      // collapsed: P undoes a mirrored parent, F applies the part's own flip
      // bit. Both are reflections, so only their *parity* was visible in the
      // handedness the old `improper ? FLIP_X : IDENTITY` form was tuned
      // against - and parity is all it preserved. It got the axis wrong
      // whenever the parent was mirrored: FLIP_Y = R(180) . FLIP_X, so
      // collapsing P . F to a single FLIP_X (or, when both fire, to IDENTITY)
      // silently drops a half-turn. Measured against the pre-pull corpus, that
      // was 44 of 44 `small-l-flip` under a mirrored parent drawn exactly 180
      // degrees out. det(P . F) is identical to the old det(K) in all four
      // combinations, so every flip bit and every pinned hand still holds.
      // P cancels every improper map standing above the part, which since the
      // re-source can include the feature's own mirror as well as the parent's.
      // det(M . Mf) reduces to the old det(M) whenever the feature is proper.
      const P = det(matmul(M, Mf)) < 0 ? FLIP_Y : IDENTITY;
      const F = flip ? FLIP_X : IDENTITY;
      const K = matmul(P, F);
      // Q rotates the legacy drawing onto the upstream part's orientation, so it
      // sits inside K: the flip axis was calibrated in the part's frame, not the
      // legacy template's. The two orders differ only where a part carries both
      // a flip bit and a turn that is not a half-turn (`corner` alone today, a
      // quarter-turn not commuting with FLIP_X), and the pre-pull corpus picks
      // this one there by 51/68 exact matches against 2/68.
      const A = matmul(matmul(Vinv, Mf), matmul(K, rotationMatrix(turn)));
      // S rides through the child's full map, so it is applied after Q: what it
      // re-anchors is the polygon as finally oriented, not as drawn. It is zero
      // for an upstreamFootprint part (a rectangle re-anchored onto itself),
      // but derive it rather than special-case it.
      const S = matvec(A, anchorOffset(footprint));
      // Undo the V now folded into the parent's transform, so the child lands
      // at M . feature.position regardless of the variant. This used to apply V
      // itself, on the grounds that every registered variant was self-inverse;
      // the re-source registered one that is not (Triangle#12 = R270, a
      // reflection composed onto a reflection), so it takes the real inverse.
      // W: `feature.position` anchors the roof's centre; step to the extent's
      // centre in the part's own frame before undoing V, so the emitted child
      // occupies the space upstream's model does rather than its roof's.
      const shift = matvec(Mf, partAnchorShift(upstream));
      const anchor = matvec(Vinv, {
        x: feature.position.x + shift.x,
        y: feature.position.y + shift.y,
      });
      const child = {
        id: `${piece.id}-${feature.id}`,
        name: feature.id,
        piece_type: "feature",
        template,
        // resolvePiece prefers an inline footprint over the template's, while
        // the downstream converters keep keying their feature type and colour
        // off `template`. So the child draws at Battlemaster's size and still
        // renders as a generator / l-ruin. The three parts under neither rule
        // stay on their template alone.
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
