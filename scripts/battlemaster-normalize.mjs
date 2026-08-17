import { footprintPolygon, centroid } from "./terrain-resolver.mjs";

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
//       renders as the same l-ruin variant. It is the composition of those two
//       reflections, not a single one chosen to match their parity: the two
//       agree on handedness but differ by a half-turn, so collapsing them turns
//       the part (see the comment at the K in normalizeLayout).
//
//   Q - the legacy template and the upstream part are two drawings of the same
//       physical model, but not always in the same orientation: six of the
//       twelve parts are drawn a quarter- or half-turn apart. `rotation_degrees`
//       is copied from upstream verbatim, so without Q those six render turned.
//
//   F - substituting the legacy footprint is only sound where that polygon says
//       something upstream's does not. Upstream ships every part as a plain
//       rectangle, so for the chiral `corner-*` parts the legacy polygon is
//       carrying the whole L shape and must win. But where the legacy footprint
//       is *itself* a plain rectangle it adds no shape at all, only a size -
//       and the sizes disagree, by up to (1.5, 2)in. There the substitution can
//       only ever be a worse-measured version of upstream's own rectangle, so
//       those parts (`generator`, `tower`) carry upstream's footprint inline
//       and keep the legacy template id purely for the feature type and colour
//       rect-to-feature.mjs reads off it. See PART_TO_TEMPLATE for the two
//       rectangle parts this rule does *not* reach.
//
//   S - upstream anchors `position` at the part's *rectangle* centre, which for
//       a rectangle is both its bbox centre and its area centroid. resolvePiece
//       anchors at the area centroid, and the legacy `corner-*` polygons are
//       L-shaped, so their centroid sits up to (1, 1)in inside their bbox
//       centre. S re-anchors the substituted polygon by that offset, otherwise
//       every L-shaped part lands ~1in off upstream's placement.
//
// Q, S and the flip bits are all measured against the pre-pull corpus (the
// legacy-vocabulary layouts this repo shipped at f1d98fb, immediately before
// c1bb2b4 adopted the battlemaster source). Both corpora draw the same physical
// terrain, so for each part the rigid map taking our emitted piece onto the
// pre-pull piece is a direct read-out of the correction. See
// battlemaster-registration.test.mjs for what is pinned and how.

/** Legacy area template for each Battlemaster size class. */
export const SIZE_CLASS = {
  BR: "area-large",
  SR: "area-medium",
  SL: "area-short-line",
  LL: "area-long-line",
  TR: "area-trapezoid",
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
// The four parts absent from that table (tower, long-barrier, short-barrier,
// pipes) map onto rectangles or a near-symmetric barricade, where 0 and 180 are
// indistinguishable and 90/270 are decisively worse; they take turn 0.
//
// `generator` and `tower` are absent for a different reason: they take
// upstream's own footprint, so they have no legacy drawing to re-orient and
// their turn is 0 by construction. (Sweeping `generator` against the pre-pull
// corpus while it still used the legacy polygon read 0.20in at 90/270 against
// 0.88in at 0/180 - the pre-pull generator is landscape, as upstream's 4.5x2 is
// - but 0.20in was the floor, because a 4x3 stand-in cannot sit on a 4.5x2
// model exactly.)
//
// Legacy bbox (under its turn) against the upstream part's rectangle, all
// twelve, which is what F above is reading:
//
//   part          legacy   upstream   delta
//   ab            5x4.5    3.75x4.5   +1.25  0        L-shaped: legacy polygon
//   ef            4.5x5    4.5x6       0    -1        carries the shape, so it
//   co            6.5x3    6x2.5      +0.5  +0.5      stays whatever the size
//   gh            3x6.5    3x6         0    +0.5      disagreement.
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
//
// The two rectangle parts that keep their legacy footprint anyway:
//
//   long-barrier - maps onto the `pipe` *building* template, and a building is
//     drawn at its templates-simple.yml size, not at its piece's: placement.ts
//     throws if the pinned corner distance disagrees with the template edge by
//     more than 0.1in, and feature-to-building.mjs pins on a 5.5in edge that a
//     4.5x0.5 rectangle does not have. Adopting upstream's size here means
//     redrawing the gw template, not setting a flag.
//   pipes - maps onto `catwalk`, which ruinFeatures consumes and drops; all it
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
  ab: { template: "corner-ruin-balanced-left", flip: true, turn: 180 },
  ef: { template: "corner-ruin-balanced-right", flip: false, turn: 90 },
  co: { template: "corner-ruin-left", flip: false, turn: 90 },
  gh: { template: "corner-ruin-right", flip: false, turn: 0 },
  corner: { template: "corner-tiny", flip: true, turn: 270 },
  "small-l": { template: "corner-short", flip: true, turn: 180 },
  "small-l-flip": { template: "corner-short", flip: false, turn: 180 },
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

/** Centre of a ring's axis-aligned bounding box. */
export function bboxCentre(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/**
 * S: the part-frame offset re-anchoring a legacy footprint from the area
 * centroid resolvePiece uses onto the bbox centre upstream's `position` means.
 * Zero for every rectangle part, up to (1, 1)in for the L-shaped `corner-*`.
 */
export function anchorOffset(footprint) {
  const ring = footprintPolygon(footprint);
  const c = centroid(ring);
  const b = bboxCentre(ring);
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
  return matmul(rotation(piece.rotation_degrees ?? 0), S);
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
      const part = partOf(feature.template);
      const { template, flip, turn, upstreamFootprint } = PART_TO_TEMPLATE[part];
      const source = templatesById.get(
        upstreamFootprint ? feature.template : template,
      );
      if (!source) {
        throw new Error(
          `layout ${layout.id} maps part ${part} onto missing template ${
            upstreamFootprint ? feature.template : template
          }`,
        );
      }
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
      const P = det(M) < 0 ? FLIP_Y : IDENTITY;
      const F = flip ? FLIP_X : IDENTITY;
      const K = matmul(P, F);
      // Q rotates the legacy drawing onto the upstream part's orientation, so it
      // sits inside K: the flip axis was calibrated in the part's frame, not the
      // legacy template's. The two orders differ only where a part carries both
      // a flip bit and a turn that is not a half-turn (`corner` alone today, a
      // quarter-turn not commuting with FLIP_X), and the pre-pull corpus picks
      // this one there by 51/68 exact matches against 2/68.
      const A = matmul(
        matmul(V, rotation(feature.rotation_degrees ?? 0)),
        matmul(K, rotation(turn)),
      );
      // S rides through the child's full map, so it is applied after Q: what it
      // re-anchors is the polygon as finally oriented, not as drawn. It is zero
      // for an upstreamFootprint part (a rectangle re-anchored onto itself),
      // but derive it rather than special-case it.
      const S = matvec(A, anchorOffset(source.footprint));
      // V is self-inverse (asserted in battlemaster-registration.test.mjs), so
      // applying it here undoes the V now folded into the parent's transform.
      // If a future variant is ever registered that is not self-inverse,
      // that assertion fails at registration time and this line must change
      // to use the variant's actual inverse (matvec(inverse(V), ...)) rather
      // than V itself.
      const anchor = matvec(V, feature.position);
      const child = {
        id: `${piece.id}-${feature.id}`,
        name: feature.id,
        piece_type: "feature",
        template,
        // Only for an upstreamFootprint part: resolvePiece prefers an inline
        // footprint over the template's, while rect-to-feature.mjs keys its
        // feature type and colour off `template`. So the child draws
        // Battlemaster's rectangle and still renders as a generator.
        ...(upstreamFootprint ? { footprint: source.footprint } : {}),
        parent_area_id: piece.id,
        position: { x: anchor.x + S.x, y: anchor.y + S.y },
        ...decompose(A),
      };
      pieces.push(child);
    }
  }
  return { ...layout, pieces };
}
