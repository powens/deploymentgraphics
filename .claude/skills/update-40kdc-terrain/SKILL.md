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
```

## Reading the drift — what to expect on a real pull

Inspect the `combined.yml` diff and the source JSON diff before trusting the result.
Past pulls carried non-obvious payloads:

- **Newly-skipped layouts are expected and safe.** The converter skips any source layout
  with no `mission_matchup_id` (logged as "non-mission layout") — fan/tournament formats
  like `kotc-colosseum` that ship unmapped templates (`impassable-wall`, `kotc-ruin-*`).
  Supporting them is a separate design effort; do NOT just remove the filter (it throws on
  the unmapped area pieces). See memory `40kdc-kotc-exclusion`.
- **Dropped/added mission layouts** change the 45-variant set (15 matchups × 3). A drop can
  break converter unit tests that hard-code a layout as a fixture
  (`scripts/{objective-icons,rect-to-feature,ruin-to-feature}.test.mjs` once hard-coded
  `gw-11e-crucible`). Re-fixture to a surviving layout. See memory `40kdc-layout-gaps`.
- **Geometry nudges + new fields** (`game_version`, `description`, `variant`, redrawn
  `area-*` footprints) are normal. Judge magnitude — a past pull moved layouts a mean
  ~0.5in / max ~3.3in. Modest drift is fine; a large unexplained shift warrants a look.
- **gw.yml patch overlays survive the re-pull.** A `gw.yml` entry whose id matches a ported
  40kdc layout is an *additive patch* (its array fields append to the generated entry), used
  to fill upstream content gaps durably. Don't edit the vendored source JSON to fix a piece —
  it gets clobbered on the next pull. See memory `gw-yml-patch-overlays`. The mechanism is
  still fully supported, but there is currently no live example: the one overlay this repo
  ever carried (`disruption-vs-purge-the-foe-3`) was retired during the battlemaster-11e
  migration because upstream filled the gap it used to patch.
- **Every layout now passes through `scripts/battlemaster-normalize.mjs` before conversion.**
  Upstream's `battlemaster-11e` re-source moved corner ruins, pipes, generators, etc. off the
  layout's `pieces[]` and onto the composite area template's `features[]`; the normalizer
  rewrites a composite layout back into the flat legacy piece vocabulary the rest of the
  pipeline expects, so nothing downstream had to change. See the module's header comment for
  the `V` (rigid-variant) and `K` (chirality) subtleties. It throws loudly rather than
  guessing on:
  - **Unknown Battlemaster size class** (`unknown Battlemaster size class for composite …`) —
    upstream added a size class (`BR`/`SR`/`SL`/`LL`/`TR`) not in `SIZE_CLASS`. Add the new
    class and its legacy area template.
  - **Unmapped part template** (`no legacy template mapping for part …`) — upstream added a
    composite feature part not in `PART_TO_TEMPLATE`. Add it, and see the `flip` note below.
  - **Inline piece footprint on a composite** (`… carries an inline footprint; composite
    retemplating … would discard it`) — upstream attached a per-piece footprint (currently
    only seen on `kotc-colosseum`) to a composite area piece. That would silently disagree
    with the retemplated archetype; work out what upstream is telling you before removing
    the guard.
  - **Unregistered composite footprint variant** — not a throw, but a *test* failure in
    `scripts/battlemaster-registration.test.mjs` (`… is not the registered rigid variant of
    its archetype`): a new composite's footprint isn't byte-identical to its archetype and
    isn't in `VARIANT` either. Add the rigid transform to `VARIANT`. A new `VARIANT` entry
    **must be self-inverse** — there is a test (`registers only self-inverse variants`) that
    asserts it, because the normalizer applies it to a child position and expects it to
    cancel out.
  - A new part's `flip` bit and `turn` in `PART_TO_TEMPLATE` must be **derived**, never
    guessed: match the new part against the nearest pre-pull piece of the same legacy
    template and read off which l-ruin variant it actually rendered as, and the rigid map
    between the two rings. Guessing wrong is invisible to the suite — see the chirality-pin
    test in `battlemaster-registration.test.mjs` and its comment. Do **not** use a
    bounding-box aspect ratio to pick `turn`; it is blind to a half-turn and gets `ab` wrong.
  - First decide whether the legacy footprint should be substituted at all. Upstream ships
    every part as a plain rectangle, so where the legacy template is a *polygon* it is
    carrying shape upstream discarded (the `corner-*` L, the 8-vertex `barricade`) and must
    stay. Where the legacy template is itself a **rectangle**, it adds only a size — and the
    sizes disagree by up to (1.5, 2)in with no consistent margin convention — so upstream's
    own rectangle wins: set `upstreamFootprint: true` (as `generator` and `tower` do), which
    carries upstream's footprint onto the child and keeps the legacy template id only for
    the downstream feature type and colour. Two rectangle parts are exceptions, for reasons
    worth knowing before you add a third: `long-barrier` maps onto the `pipe` **building**
    template, which is drawn at its `templates-simple.yml` size and throws in `placement.ts`
    if the pinned edge disagrees by >0.1in (adopting upstream's size there means redrawing
    the gw template); `pipes` maps onto `catwalk`, which is consumed and dropped, so
    switching it is provably output-neutral.

## Common mistakes

- Running `make update-terrain` and stopping — presets are now stale. Run `pnpm gen:presets`.
- Treating a skipped `kotc`-style layout or a new `game_version` field as a regression.
- Editing `combined.yml` or the source JSON by hand — both are generated / re-pulled. Edit
  `templates-simple.yml`, `templates-real.yml`, `gw.yml`, or fix upstream.
