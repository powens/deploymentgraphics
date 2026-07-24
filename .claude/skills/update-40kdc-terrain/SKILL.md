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
  it gets clobbered on the next pull. See memory `gw-yml-patch-overlays`.

## Common mistakes

- Running `make update-terrain` and stopping — presets are now stale. Run `pnpm gen:presets`.
- Treating a skipped `kotc`-style layout or a new `game_version` field as a regression.
- Editing `combined.yml` or the source JSON by hand — both are generated / re-pulled. Edit
  `templates-simple.yml`, `templates-real.yml`, `gw.yml`, or fix upstream.
