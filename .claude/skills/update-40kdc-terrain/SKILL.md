---
name: update-40kdc-terrain
description: Use when checking wn-mitch/40kdc-data for new terrain data, or refreshing the vendored 40kdc source and regenerating combined.yml / presets — pull, drift-check, convert, verify.
---

# Update 40kdc Terrain

## Overview

Refresh the vendored upstream terrain (`wn-mitch/40kdc-data`) and propagate it into the
generated `combined.yml` and the bundled presets. The mechanical steps are simple; the
value of this skill is the **drift interpretation** and the **known re-pull side effects**
that a naive `make update-terrain` will miss (`gen:presets` is NOT part of it).

Most pulls are mechanical. But upstream has twice now re-exported the whole corpus while
keeping the `source: battlemaster-11e` label — renaming every id and, the second time,
changing what its fields *mean* — and that is a normalizer port, not a runbook step.
"Is this a refresh or a re-source?" is the first question the drift check has to answer;
see **When upstream re-sources**.

Source of truth for the data pipeline is CLAUDE.local.md ("Config" section). This is the
operational runbook.

## Workflow

```
1. make pull-terrain          # re-download upstream JSON into terrain/source/40kdc/
2. git status --short          # DRIFT CHECK — clean tree => no new data, STOP here
3. pnpm convert:40kdc          # regenerate static/data/terrain/combined.yml
4. pnpm gen:presets            # regenerate src/presets/* (NOT run by make update-terrain!)
5. verify (see below)
```

Steps 1–2 answer "is there new data?". If `git status` is clean after the pull, upstream
hasn't changed — report that and stop. Only continue when the source JSON actually moved.

`make update-terrain` = pull + convert **only**. It does not run `gen:presets`, so the
preset test / `gen:presets:check` will fail until you run step 4 by hand.

## Verify

```
pnpm convert:40kdc:check      # fails if combined.yml is stale
pnpm gen:presets:check        # fails if src/presets/* are stale
pnpm test                     # full suite
pnpm lint && pnpm type-check
```

`assets/sample.svg` is tracked and rendered from a real layout, so it also moves on a pull
with geometry in it. Regenerate it (`pnpm build:lib && node --experimental-strip-types
scripts/render-sample.mjs`) and *look at it* — it is the cheapest check that the board still
reads correctly, and a mirrored or quarter-turned building is obvious there and nowhere else.

## Reading the drift — what to expect on a real pull

Inspect the `combined.yml` diff and the source JSON diff before trusting the result.
Past pulls carried non-obvious payloads:

- **Newly-skipped layouts are expected and safe.** The converter skips any source layout
  with no `mission_matchup_id` (logged as "non-mission layout") — fan/tournament formats
  like `kotc-colosseum` that ship unmapped templates (`impassable-wall`, `kotc-ruin-*`).
  Supporting them is a separate design effort; do NOT just remove the filter (it throws on
  the unmapped area pieces).
- **Layout ids are not stable.** The battlemaster-11e re-source renamed all 45
  (`take-and-hold-mirror-1` → `bm-take-vs-take-01`). What *is* stable is
  `mission_matchup_id` + `variant`, so pair old and new layouts on that, never on the id.
  A rename breaks every test that hard-codes a layout as a fixture
  (`scripts/{objective-icons,layout-to-placements,ruin-to-feature}.test.mjs`,
  `src/render-to-string.test.ts`, `scripts/render-sample.mjs`). Re-point them at the same
  matchup+variant, and **re-check the property the fixture was chosen for** — those tests
  assert things like "this layout's central objective pair touches, so it collapses to one
  marker", which upstream can change out from under the id.
- **Dropped/added mission layouts** change the 45-variant set (15 matchups × 3). Same
  re-fixturing hazard; re-fixture to a surviving layout.
- **Geometry nudges + new fields** (`game_version`, `description`, `variant`, `board`,
  `keystones`, `objective.position`, redrawn `area-*` footprints) are normal. Judge
  magnitude. Upstream re-lays out real terrain between pulls: the battlemaster-11e
  re-source moved areas a mean 0.52in / median 0.06in, but with a long tail — 31 of 45
  layouts had between 2 and 14 of their 16 areas move, up to 17in. Movement in **even
  counts per layout** is the signature of a genuine upstream edit (the boards are
  180°-symmetric, so a moved piece moves in a pair); movement spread uniformly across every
  use of one composite is the signature of a bug in *our* transform.
- **gw.yml patch overlays survive the re-pull.** A `gw.yml` entry whose id matches a ported
  40kdc layout is an *additive patch* (its array fields append to the generated entry), used
  to fill upstream content gaps durably. Don't edit the vendored source JSON to fix a piece —
  it gets clobbered on the next pull. The mechanism is still fully supported, but there is
  currently no live example: the one overlay this repo ever carried
  (`disruption-vs-purge-the-foe-3`) was retired during the battlemaster-11e migration
  because upstream filled the gap it used to patch. Note a patch is keyed by layout id, so
  an id rename silently orphans it — check `gw.yml` against the new ids after a re-source.

## The normalizer

**Every layout passes through `scripts/battlemaster-normalize.mjs` before conversion.**
Upstream's `battlemaster-11e` source keeps corner ruins, pipes, generators, etc. on the
composite area template's `features[]` rather than the layout's `pieces[]`; the normalizer
rewrites a composite layout back into the flat legacy piece vocabulary the rest of the
pipeline expects, so nothing downstream has to change. Read the module's header first — it
names each correction (`V` variant, `K` chirality, `Q` turn, `W` extent, `F`/`Z` footprint,
`S` anchor) and that vocabulary is used throughout below.

It throws loudly rather than guessing on:

- **Unknown Battlemaster size class** (`unknown Battlemaster size class for composite …`) —
  upstream added a class not in `SIZE_CLASS`. The current six are `BigRect`, `SmallRect`,
  `ShortLine`, `LongLine`, `LongLineTower`, `Triangle`, read from the second word of the
  composite's `name`. (`LongLineTower` is upstream's own typo for a `LongLine`, not a sixth
  archetype — it maps onto `area-long-line` like its siblings.) Add the new class and its
  legacy area template.
- **Unmapped part template** (`no legacy template mapping for part …`) — upstream added a
  composite feature part not in `PART_TO_TEMPLATE`. Part ids carry a content hash
  (`bm-part-ab-68b696d07f`) which `partOf` strips, so two ids can be the same part; check
  whether the "new" part is actually a duplicate before registering it (`cd` turned out to
  be byte-identical to `co` — same footprint, walls, thickness and roof flag — and simply
  takes `co`'s row). A part with no legacy counterpart at all can be registered
  `{ drop: true }`, as `ruin-part` is.
- **Inline piece footprint on a composite** (`… carries an inline footprint; composite
  retemplating … would discard it`) — upstream attached a per-piece footprint (currently
  only seen on `kotc-colosseum`) to a composite area piece. That would silently disagree
  with the retemplated archetype; work out what upstream is telling you before removing
  the guard.
- **Unhandled composite feature field** (`… carries unhandled field \`x\`; normalization
  would drop it`) — this guard has already earned itself once. Upstream started shipping a
  feature-level `mirror`, which is exactly the axis `K` controls; without the guard it would
  have been dropped in silence and emitted a child of the wrong chirality while every test
  still passed. Handle the field, don't widen `FEATURE_KEYS` to silence it.
- **Unregistered composite footprint variant** — not a throw, but a *test* failure in
  `scripts/battlemaster-registration.test.mjs`. Add the rigid transform to `VARIANT`.
  A `VARIANT` entry no longer has to be self-inverse (`Triangle#12` is `R270`); the
  normalizer takes a real `orthoInverse`, and what the test pins is only that `V` is
  orthogonal — plus which entry is the non-self-inverse one, so a "simplification" back to
  `matvec(V, …)` can't pass unnoticed.

### Deriving a new part's registration

A new part's `flip` bit and `turn` must be **derived**, never guessed — guessing wrong is
invisible to the suite. Match the new part against the nearest pre-pull piece of the same
legacy template and read off the rigid map between the two rings, and which l-ruin variant
it actually rendered as. See the chirality-pin test in `battlemaster-registration.test.mjs`.

Do **not** use a bounding-box aspect ratio to pick `turn`: it is blind to a half-turn and
gets `ab` wrong. And note that for `upstreamSize` parts a sweep can only ever resolve
`turn`/`flip` up to the pair that produces the same polygon — Z resizes every candidate
legacy L onto the *same* rectangle, so all twelve template/turn/flip combinations tie
exactly. The template must be chosen by correspondence with the pre-pull piece, not by
geometry.

### W — the extent, and the anchor

Upstream's part `footprint` is **the roofed area, not the model**. The rest of the model
lives in `walls` (a polyline per wall, with a thickness). `partExtent` reconstructs the
extent as the bounding box of the roof polygon **unioned with the wall centrelines** — that
reproduces the pre-re-source rectangle exactly, which is what let every `turn`, flip bit and
the F/Z rules survive the re-source untouched. Take the union and not either alone: walls
alone lose a barrier's whole 0.5in depth (its centreline runs along one edge of its
footprint, not down its middle), and the roof alone is a corner of an L-ruin.

The half of this that hides: **`position` anchors the centre of the *roof***, so for the
five big L-ruins it is up to (1.25, 1.5)in off the model's centre. `partAnchorShift` is that
offset. Nothing in the suite catches it directly — it shows up only as children drifting out
of their own parents, so use the containment check below.

### F / Z — which footprint a child draws from

First decide whether the legacy footprint should be substituted at all. Upstream's own
drawing of a part is a plain rectangle (see W), so where the legacy template is a *polygon*
it is carrying shape upstream discarded (the `corner-*` L, the 8-vertex `barricade`) and
must stay. Where the legacy template is itself a **rectangle**, it adds only a size — and
the sizes disagree by up to (1.5, 2)in with no consistent margin convention — so upstream's
own extent wins: set `upstreamFootprint: true` (as `generator` and `tower` do), which
carries that extent onto the child and keeps the legacy template id only for the downstream
feature type and colour.

Two rectangle parts are exceptions, for reasons worth knowing before you add a third:
`long-barrier` maps onto the `pipe` **building** template, which is drawn at its
`templates-simple.yml` size and throws in `placement.ts` if the pinned edge disagrees by
>0.1in (adopting upstream's size there means redrawing the gw template); `pipes` maps onto
`catwalk`, which is consumed and dropped, so switching it is provably output-neutral.

A polygon part keeps its *shape* but not its *size*: set `upstreamSize: true` (all six
`corner-*` templates do) and Z resizes the legacy L onto the upstream extent, moving only
each axis's far side so the 0.5in arms survive — which keeps the emitted footprint identical
to the polygon `lRuin` will draw. It throws if the resize misses the target box, which
happens when a part's arm is no longer inside it — a redrawn upstream part is the likely
cause. `short-barrier` is excluded: `feature-to-building.mjs` matches its 8-vertex profile
to pick the `barricade` template, so its polygon is load-bearing beyond its bbox.

### Don't reintroduce a proximity heuristic for catwalk roofing

`ruin-to-feature.mjs` emits plain `l-ruin` everywhere and only *drops* catwalks; the `-roof`
variants stay reachable for hand-authored `gw.yml` layouts. Upstream ships `pipes` as its own
standalone composite, so no catwalk is ever a sibling of a ruin part, and no catwalk overlaps
or bridges one anywhere in the corpus. This was a centroid-distance threshold
(`ROOF_DISTANCE`) that had to be re-tuned every time a ruin was resized, and it was selecting
catwalks ~0.5in clear of a ruin while skipping six that are flush against one. If
`emits no -roof variant, because no catwalk rests on a ruin` fails, upstream genuinely has
seated a catwalk on a ruin — read the geometry before changing the test.

## When upstream re-sources

Symptoms in the step-2 drift check: every layout id changed, template ids changed, the
source JSON grew by an order of magnitude, or `pnpm convert:40kdc` dies on
`no gw template mapping for area template …`. The quietest and most reliable tell is a
layout's `description`, which names the export it came from — it went
`Imported from Battlemaster layout terrain-<uuid>` →
`Imported from Battlemaster REST API layout superwutz/<name>` last time, while `source`
stayed `battlemaster-11e` throughout. `source` will not tell you.

A re-source is a normalizer port. Say so and get agreement on scope before starting — it is
hours, not minutes.

**Freeze the pre-pull corpus first, before touching the normalizer.** It is the only oracle
for `V`, `turn`, `flip` and the template mappings, and once the module is edited it is gone.
Write the old JSON to a scratch dir (`git show HEAD:…`), run the *current* `normalizeLayout`
over it, and dump every piece resolved to board coordinates plus its transform, keyed by
`mission_matchup_id#variant`. Everything below derives against that file.

Derivation notes from the last one:

- **Derive `V` from the corpus, not from the archetype.** Composites are individually traced
  outlines now (167–348 vertices), so no rigid map takes the coarse legacy archetype onto one
  exactly — fitting them prefers the *wrong* answer for the near-centrosymmetric classes.
  Instead pair each new area with the pre-pull area of the same archetype nearest it (a
  global assignment within the layout, not independently-nearest, or symmetric twins collide)
  and read `V = M_new⁻¹ · M_old` straight off the two transforms.
- **Group those votes by footprint, not by composite id.** `V` is a property of the shape;
  52 composites share 13 distinct footprints, which turns a noisy per-id estimate into 14–130
  votes each. Discard loose pairings before counting — a mis-pair against a piece upstream
  moved is what produces a stray dissenting vote.
- **Fill any footprint the corpus can't reach structurally.** Within a class, footprints are
  exact rigid transforms of each other (0.0000in against a 1.5–3.9in runner-up), so
  `V_b = W · V_a` off a sibling whose `V` the corpus did decide.
- **`ringMismatch` is vertex-to-vertex Hausdorff** and is useless across the traced/archetype
  seam: a point halfway along the trapezoid's long edge is 5.75in from the nearest archetype
  corner even when the shapes coincide exactly. It measures sampling density, not shape. Use
  the `shapeDistance` helper in `battlemaster-registration.test.mjs` (vertices to the other
  ring's *outline*) for anything crossing that seam; `ringMismatch` stays exact between two
  rings drawn from the same footprint.

Verify a port on three things, in this order — each catches what the others cannot:

1. **Emitted template counts, against the pre-pull corpus.** These should come out
   *identical* (they did: 46 layouts / 998 templates / 904 features), because a re-source
   redraws the same physical terrain. Any difference is either a real upstream content
   change you can point at, or a bug.
2. **Child containment.** For every emitted child, how far does it fall outside its own
   parent — measured against *upstream's own composite outline*, not the coarse archetype.
   This is the only check that catches an anchor error, and it is what caught W's roof/extent
   offset (270 of 360 BigRect children up to 1.25in outside; 0 of 360 after). Expect a small
   irreducible residual: 90 catwalks at 0.5in (pre-existing, and they get dropped), and five
   composites where **upstream's own** parts overhang **upstream's own** outlines — three of
   them materially, up to 3.7in. Verify that claim against the raw data (place the wall
   centrelines through upstream's own frame) before writing anything off as upstream's.
3. **180° rotational symmetry of the emitted corpus.** Oracle-free, and a systematic
   `V`/flip/turn error breaks it. It should come out tighter than the pre-pull corpus.

Then re-fixture the tests (see the id-rename note above) and update the module header and
this skill, both of which describe upstream's schema and go stale the moment it moves.

## Common mistakes

- Running `make update-terrain` and stopping — presets are now stale. Run `pnpm gen:presets`.
- Treating a skipped `kotc`-style layout or a new `game_version` field as a regression.
- Editing `combined.yml` or the source JSON by hand — both are generated / re-pulled. Edit
  `templates-simple.yml`, `templates-real.yml`, `gw.yml`, or fix upstream.
- Re-pointing a renamed layout fixture without re-checking the property it was chosen for.
- Reading a part's `footprint` as its extent — it is the roof. Use `partExtent`.
- Comparing an emitted area against upstream's outline with `ringMismatch`.
- Guessing a new part's `turn`/`flip`, or picking them from a bounding-box aspect ratio.
