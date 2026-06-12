// Merges the hand-authored static/data/terrain/gw.yml (building templates +
// demo layout) with the vendored 40kdc-data terrain JSON into a single
// static/data/terrain/combined.yml. Each `area` piece becomes a building
// placement referencing a gw template; corner-ruin pieces become `l-ruin`
// features (with `l-ruin-roof` where a catwalk sits on them); catwalk pieces
// are dropped; every other `feature` piece becomes a polygon area_terrain entry
// (absolute points); each is_objective piece becomes a skull icon at its
// centre. Deterministic + re-runnable.
//
// Run: pnpm convert:40kdc  (or: node scripts/convert-40kdc-terrain.mjs)

import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import { resolvePiece } from "./terrain-resolver.mjs";
import { areaBuildingPlacement, round } from "./area-to-building.mjs";
import { ruinFeatures } from "./ruin-to-feature.mjs";
import { rectFeatures } from "./rect-to-feature.mjs";
import { matchupToDispositions } from "./matchup-to-dispositions.mjs";

const srcDir = new URL("../static/data/terrain/source/40kdc/", import.meta.url);
const gwPath = new URL("../static/data/terrain/gw.yml", import.meta.url);
const outPath = new URL("../static/data/terrain/combined.yml", import.meta.url);

const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, srcDir), "utf8"));

const layouts = readJson("terrain-layouts.json");
const templates = readJson("terrain-templates.json");

const footprintById = new Map(templates.map((t) => [t.id, t.footprint]));
const lookupFootprint = (id) => footprintById.get(id);

// Theme label per area_terrain feature piece, coloured by material category,
// mirroring the demo layout's palette (rust pipes, sand barricades). Unknown
// feature templates fall back to the generic `feature` style. Categories
// resolve to colours in static/data/theme.yml. (Area pieces become buildings,
// corner-ruins become l-ruin features, and generators/gantries become rectangle
// features; none is labelled here. Catwalks are dropped.)
const FEATURE_LABELS = {
  pipe: "pipe",
  barricade: "barricade",
};

const labelFor = (piece) => FEATURE_LABELS[piece.template] ?? "feature";

// gw.yml is the hand-authored input: building templates plus the demo
// layout ("1"). The ported 40kdc layouts are layered on top of it, so the
// combined file is a superset of the demo with the real layouts added.
const gw = yaml.load(readFileSync(gwPath, "utf8"));
const out = {
  ...gw,
  templates: { ...(gw.templates ?? {}) },
  layout: { ...(gw.layout ?? {}) },
};

for (const layout of layouts) {
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  const getParent = (id) => byId.get(id);
  // Corner-ruins become l-ruin features (roofed where a catwalk sits on them);
  // catwalk pieces are dropped. Generators/gantries become rectangle features.
  // `consumedIds` are the pieces the area_terrain pass must skip.
  const ruin = ruinFeatures(layout, lookupFootprint, getParent);
  const rect = rectFeatures(layout, lookupFootprint, getParent);
  const features = [...ruin.features, ...rect.features];
  const consumedIds = new Set([...ruin.consumedIds, ...rect.consumedIds]);
  const buildings = [];
  const area_terrain = [];
  const icons = [];
  for (const piece of layout.pieces) {
    if (piece.piece_type === "area") {
      buildings.push(
        areaBuildingPlacement(
          piece,
          lookupFootprint(piece.template),
          out.templates,
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
    if (piece.is_objective) {
      icons.push({
        type: "skull",
        pos: { x: round(piece.position.x), y: round(piece.position.y) },
      });
    }
  }
  // 40kdc layout metadata: the deployment pattern (kept for downstream use,
  // currently unrendered) and the mission matchup split into its two
  // dispositions. Both are absent on the hand-authored demo layout.
  const dispositions = matchupToDispositions(layout.mission_matchup_id);
  const entry = {};
  if (layout.deployment_pattern_id)
    entry.deployment_pattern_id = layout.deployment_pattern_id;
  if (dispositions) entry.dispositions = dispositions;
  entry.buildings = buildings;
  entry.area_terrain = area_terrain;
  if (features.length > 0) entry.features = features;
  if (icons.length > 0) entry.icons = icons;
  out.layout[layout.id] = entry;
}

const header =
  "# GENERATED FILE - do not edit by hand.\n" +
  "# Produced by scripts/convert-40kdc-terrain.mjs by merging the\n" +
  "# hand-authored static/data/terrain/gw.yml (templates + demo layout)\n" +
  "# with the vendored 40kdc-data JSON under\n" +
  "# static/data/terrain/source/40kdc/.\n" +
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
}
