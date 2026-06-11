# 40kdc-data terrain source (vendored)

`terrain-layouts.json` and `terrain-templates.json` are copied verbatim from
[`wn-mitch/40kdc-data`](https://github.com/wn-mitch/40kdc-data)
(`data/core/`). They are the input to `scripts/convert-40kdc-terrain.mjs`,
which resolves every piece to absolute board polygons and writes
`static/data/terrain/40kdc.yml`.

Do not edit these by hand — re-download from upstream to update, then re-run
`node scripts/convert-40kdc-terrain.mjs`.
