# Changelog

All notable changes to this package. This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html); while the version is
below 1.0.0, breaking changes ship in minor releases.

## Unreleased

### Breaking

**Every 40kdc mission layout id has changed.** `gwTerrain.layout` is a
`Record<string, TerrainLayout>` keyed by these ids, and `buildConfig({ layout })`
selects by that key, so `layout: "take-and-hold-mirror-3"` no longer resolves.

The rename is upstream's: the 40kdc source re-exported its whole corpus under new
ids, and this package passes them through rather than minting its own. No aliases
are provided — pick the new id from the table below. The hand-authored demo
layout `"1"` and the `templates-simple` layouts (`large-area`, `small-area`,
`small-pipes`, `large-pipes`, `shoe-mirror`) are unaffected.

The 15 matchups × 3 variants set is intact and the pairing is 1:1 — each row is
the same matchup at the same variant index. Some matchup names swapped sides in
the rename (`disruption-vs-purge-the-foe` → `bm-purge-vs-disrupt`), which is a
naming change only: the two dispositions on the layout are unchanged.

| removed | replacement |
| --- | --- |
| `disruption-vs-disruption-1`           | `bm-disrupt-vs-disrupt-01` |
| `disruption-vs-disruption-2`           | `bm-disrupt-vs-disrupt-02` |
| `disruption-vs-disruption-3`           | `bm-disrupt-vs-disrupt-03` |
| `disruption-vs-priority-assets-1`      | `bm-disrupt-vs-assets-01` |
| `disruption-vs-priority-assets-2`      | `bm-disrupt-vs-assets-02` |
| `disruption-vs-priority-assets-3`      | `bm-disrupt-vs-assets-03` |
| `disruption-vs-purge-the-foe-1`        | `bm-purge-vs-disrupt-01` |
| `disruption-vs-purge-the-foe-2`        | `bm-purge-vs-disrupt-02` |
| `disruption-vs-purge-the-foe-3`        | `bm-purge-vs-disrupt-03` |
| `disruption-vs-reconnaissance-1`       | `bm-disrupt-vs-recon-01` |
| `disruption-vs-reconnaissance-2`       | `bm-disrupt-vs-recon-02` |
| `disruption-vs-reconnaissance-3`       | `bm-disrupt-vs-recon-03` |
| `priority-assets-vs-priority-assets-1` | `bm-assets-vs-assets-01` |
| `priority-assets-vs-priority-assets-2` | `bm-assets-vs-assets-02` |
| `priority-assets-vs-priority-assets-3` | `bm-assets-vs-assets-03` |
| `priority-assets-vs-reconnaissance-1`  | `bm-recon-vs-assets-01` |
| `priority-assets-vs-reconnaissance-2`  | `bm-recon-vs-assets-02` |
| `priority-assets-vs-reconnaissance-3`  | `bm-recon-vs-assets-03` |
| `purge-the-foe-vs-priority-assets-1`   | `bm-purge-vs-assets-01` |
| `purge-the-foe-vs-priority-assets-2`   | `bm-purge-vs-assets-02` |
| `purge-the-foe-vs-priority-assets-3`   | `bm-purge-vs-assets-03` |
| `purge-the-foe-vs-purge-the-foe-1`     | `bm-purge-vs-purge-01` |
| `purge-the-foe-vs-purge-the-foe-2`     | `bm-purge-vs-purge-02` |
| `purge-the-foe-vs-purge-the-foe-3`     | `bm-purge-vs-purge-03` |
| `purge-the-foe-vs-reconnaissance-1`    | `bm-purge-vs-recon-01` |
| `purge-the-foe-vs-reconnaissance-2`    | `bm-purge-vs-recon-02` |
| `purge-the-foe-vs-reconnaissance-3`    | `bm-purge-vs-recon-03` |
| `reconnaissance-vs-reconnaissance-1`   | `bm-recon-vs-recon-01` |
| `reconnaissance-vs-reconnaissance-2`   | `bm-recon-vs-recon-02` |
| `reconnaissance-vs-reconnaissance-3`   | `bm-recon-vs-recon-03` |
| `take-and-hold-mirror-1`               | `bm-take-vs-take-01` |
| `take-and-hold-mirror-2`               | `bm-take-vs-take-02` |
| `take-and-hold-mirror-3`               | `bm-take-vs-take-03` |
| `take-and-hold-vs-disruption-1`        | `bm-take-vs-disrupt-01` |
| `take-and-hold-vs-disruption-2`        | `bm-take-vs-disrupt-02` |
| `take-and-hold-vs-disruption-3`        | `bm-take-vs-disrupt-03` |
| `take-and-hold-vs-priority-assets-1`   | `bm-take-vs-prio-01` |
| `take-and-hold-vs-priority-assets-2`   | `bm-take-vs-prio-02` |
| `take-and-hold-vs-priority-assets-3`   | `bm-take-vs-prio-03` |
| `take-and-hold-vs-purge-the-foe-1`     | `bm-take-vs-purge-01` |
| `take-and-hold-vs-purge-the-foe-2`     | `bm-take-vs-purge-02` |
| `take-and-hold-vs-purge-the-foe-3`     | `bm-take-vs-purge-03` |
| `take-and-hold-vs-reconnaissance-1`    | `bm-take-vs-recon-01` |
| `take-and-hold-vs-reconnaissance-2`    | `bm-take-vs-recon-02` |
| `take-and-hold-vs-reconnaissance-3`    | `bm-take-vs-recon-03` |
### Changed

- Re-sourced the bundled 40kdc terrain corpus (`gwTerrain`) against upstream's
  `battlemaster-11e` re-export. Layout, template and feature totals are unchanged
  at 46 / 998 / 904; the movement within them is upstream's own content — 7 more
  objective icons, 4 ruins swapping hands, and 31 of the 45 mission layouts
  re-laid out, always in symmetric pairs.
