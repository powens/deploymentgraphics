// Merges the hand-authored static/data/terrain/gw.yml (demo layout) with the
// vendored 40kdc-data terrain JSON into a single static/data/terrain/combined.yml
// (layouts only — the building templates live in templates-simple.yml, which
// gen-presets merges back in). Each `area` piece becomes a building
// placement referencing a gw template; corner-ruin pieces become `l-ruin`
// features (with `l-ruin-roof` where a catwalk sits on them); catwalk pieces
// are dropped; pipe/barricade pieces become building placements (via
// feature-to-building.mjs); every other `feature` piece becomes a polygon
// area_terrain entry (absolute points); is_objective pieces become skull icons
// (a touching pair of objective pieces collapses to one marker — see
// objective-icons.mjs). Deterministic + re-runnable.
//
// Run: pnpm convert:40kdc  (or: node scripts/convert-40kdc-terrain.mjs)

import { readFileSync, writeFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { resolvePiece } from "./terrain-resolver.mjs";
import { areaBuildingPlacement, round } from "./area-to-building.mjs";
import { ruinFeatures } from "./ruin-to-feature.mjs";
import { rectFeatures } from "./rect-to-feature.mjs";
import { featureBuildings } from "./feature-to-building.mjs";
import { matchupToDispositions } from "./matchup-to-dispositions.mjs";
import { objectiveIcons } from "./objective-icons.mjs";

const srcDir = new URL("../static/data/terrain/source/40kdc/", import.meta.url);
const gwPath = new URL("../static/data/terrain/gw.yml", import.meta.url);
const templatesPath = new URL(
  "../static/data/terrain/templates-simple.yml",
  import.meta.url,
);
const outPath = new URL("../static/data/terrain/combined.yml", import.meta.url);

const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, srcDir), "utf8"));

const layouts = readJson("terrain-layouts.json");
const templates = readJson("terrain-templates.json");

const footprintById = new Map(templates.map((t) => [t.id, t.footprint]));
const lookupFootprint = (id) => footprintById.get(id);

// Pipes and barricades become building placements (see feature-to-building.mjs).
// Any other unconsumed, non-area feature piece falls back to a generic
// `feature` area_terrain zone (coloured by theme.area_terrain.feature).
const labelFor = () => "feature";

// gw.yml is the hand-authored input: the demo layout ("1"). The ported 40kdc
// layouts are layered on top of it, so the combined file is a superset of the
// demo with the real layouts added. Building templates come from
// templates-simple.yml; they are only read here to size `area` placements and
// are NOT written to combined.yml (gen-presets merges them into the preset).
const gw = yaml.load(readFileSync(gwPath, "utf8"));
const gwTemplates =
  yaml.load(readFileSync(templatesPath, "utf8")).templates ?? {};
const out = {
  layout: { ...(gw.layout ?? {}) },
};

const skipped = [];
for (const layout of layouts) {
  // Skip fan-format layouts that fall outside GW's mission system. These carry
  // no mission_matchup_id and bring their own terrain templates that have no
  // gw-template mapping (e.g. the "kotc-colosseum" King-of-the-Colosseum layout
  // with its impassable-wall / kotc-ruin-* pieces). Rendering them is a
  // separate feature; excluding them keeps `make update-terrain` re-runnable
  // and auto-skips any future fan variant (also matchup-less) rather than
  // throwing on an unmapped template.
  if (!layout.mission_matchup_id) {
    skipped.push(layout.id);
    continue;
  }
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  const getParent = (id) => byId.get(id);
  // Corner-ruins become l-ruin features (roofed where a catwalk sits on them);
  // catwalk pieces are dropped. Generators/gantries become rectangle features.
  // `consumedIds` are the pieces the area_terrain pass must skip.
  const ruin = ruinFeatures(layout, lookupFootprint, getParent);
  const rect = rectFeatures(layout, lookupFootprint, getParent);
  const feat = featureBuildings(layout, lookupFootprint, getParent);
  const features = [...ruin.features, ...rect.features];
  const consumedIds = new Set([
    ...ruin.consumedIds,
    ...rect.consumedIds,
    ...feat.consumedIds,
  ]);
  const buildings = [];
  const area_terrain = [];
  for (const piece of layout.pieces) {
    if (piece.piece_type === "area") {
      buildings.push(
        areaBuildingPlacement(
          piece,
          lookupFootprint(piece.template),
          gwTemplates,
        ),
      );
    } else if (!consumedIds.has(piece.id)) {
      const points = resolvePiece(piece, lookupFootprint, getParent).map((p) => ({
        x: round(p.x),
        y: round(p.y),
      }));
      area_terrain.push({
        shape: "polygon",
        x: 0,
        y: 0,
        points,
        label: labelFor(piece),
      });
    }
  }
  const icons = objectiveIcons(layout, lookupFootprint, getParent);
  // 40kdc layout metadata: the deployment pattern (kept for downstream use,
  // currently unrendered) and the mission matchup split into its two
  // dispositions. Both are absent on the hand-authored demo layout.
  const dispositions = matchupToDispositions(layout.mission_matchup_id);
  const entry = {};
  if (layout.deployment_pattern_id)
    entry.deployment_pattern_id = layout.deployment_pattern_id;
  if (dispositions) entry.dispositions = dispositions;
  entry.templates = [...buildings, ...feat.buildings];
  if (area_terrain.length > 0) entry.area_terrain = area_terrain;
  if (features.length > 0) entry.features = features;
  if (icons.length > 0) entry.icons = icons;
  // A gw.yml layout whose id matches this 40kdc layout is a hand-authored
  // *patch*, not a standalone demo layout: its array fields (typically
  // `features`) are appended to the generated entry. This is how we correct
  // upstream data gaps (e.g. ruins the 40kdc source omits on a variant's home
  // objectives) durably — the fix lives in gw.yml, so it survives
  // `make update-terrain` re-pulling the source. gw ids with no 40kdc match
  // (like the demo "1") remain standalone layouts, spread in above.
  const patch = gw.layout?.[layout.id];
  if (patch) {
    for (const key of ["templates", "features", "area_terrain", "icons"]) {
      if (Array.isArray(patch[key])) {
        entry[key] = [...(entry[key] ?? []), ...patch[key]];
      }
    }
  }
  // Drop any spread-in patch key first so the generated entry keeps its
  // natural 40kdc source order rather than the position the gw spread gave it.
  delete out.layout[layout.id];
  out.layout[layout.id] = entry;
}

const header =
  "# GENERATED FILE - do not edit by hand.\n" +
  "# Produced by scripts/convert-40kdc-terrain.mjs by merging the\n" +
  "# hand-authored static/data/terrain/gw.yml (demo layout) with the\n" +
  "# vendored 40kdc-data JSON under static/data/terrain/source/40kdc/.\n" +
  "# Contains layouts only; building templates live in\n" +
  "# static/data/terrain/templates-simple.yml.\n" +
  "# Edit gw.yml or the source JSON, then regenerate with:\n" +
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
