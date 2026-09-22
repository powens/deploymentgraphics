// Converts the vendored 40kdc-data terrain JSON into
// static/data/terrain/combined.yml (layouts only; gen-presets merges in the
// building templates from templates-simple.yml). Piece classification lives in
// layout-to-placements.mjs; is_objective pieces become skull icons.
//
// Run via `pnpm convert:40kdc`: it imports src/*.ts, so needs
// --experimental-strip-types below Node 22.18.

import { readFileSync, writeFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { loadCorpus } from "./terrain-corpus.mjs";
import { layoutPlacements } from "./layout-to-placements.mjs";
import { matchupToDispositions } from "./matchup-to-dispositions.mjs";
import { objectiveIcons } from "./objective-icons.mjs";

const outPath = new URL("../static/data/terrain/combined.yml", import.meta.url);

const corpus = loadCorpus();

const out = { layout: {} };

// Fan-format layouts (no mission_matchup_id, e.g. "kotc-colosseum") bring
// templates with no gw mapping, so they are skipped rather than failing the
// run; `corpus.missionLayouts` already excludes them.
const skipped = corpus.rawLayouts
  .filter((l) => !l.mission_matchup_id)
  .map((l) => l.id);

for (const layout of corpus.missionLayouts) {
  const { templates, features } = layoutPlacements(layout, corpus.gwTemplates);
  // Separate walk: `is_objective` is orthogonal to kind (an objective piece is
  // also a building), and the classification gives each piece one kind.
  const icons = objectiveIcons(layout);
  // `resolveTerrainLayout` joins on deployment pattern and dispositions.
  const dispositions = matchupToDispositions(layout.mission_matchup_id);
  const entry = {};
  if (layout.deployment_pattern_id)
    entry.deployment_pattern_id = layout.deployment_pattern_id;
  if (dispositions) entry.dispositions = dispositions;
  entry.templates = templates;
  if (features.length > 0) entry.features = features;
  if (icons.length > 0) entry.icons = icons;
  out.layout[layout.id] = entry;
}

const header =
  "# GENERATED FILE - do not edit by hand.\n" +
  "# Produced by scripts/convert-40kdc-terrain.mjs from the vendored\n" +
  "# 40kdc-data JSON under static/data/terrain/source/40kdc/.\n" +
  "# Contains layouts only; building templates live in\n" +
  "# static/data/terrain/templates-simple.yml.\n" +
  "# Edit the source JSON or the converters, then regenerate with:\n" +
  "#   pnpm convert:40kdc\n\n";

const content = header + yaml.dump(out, { lineWidth: 100 });

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(outPath, "utf8");
  } catch {
    // missing file counts as stale
  }
  if (current !== content) {
    console.error(
      "static/data/terrain/combined.yml is stale.\n" +
        "Run `pnpm convert:40kdc` and commit the result.",
    );
    process.exit(1);
  }
  console.log("combined.yml is up to date.");
} else {
  writeFileSync(outPath, content, "utf8");
  console.log(
    `Wrote ${Object.keys(out.layout).length} layouts to static/data/terrain/combined.yml`,
  );
  if (skipped.length > 0) {
    console.log(
      `Skipped ${skipped.length} non-mission layout(s): ${skipped.join(", ")}`,
    );
  }
}
