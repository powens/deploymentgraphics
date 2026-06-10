// Merges the hand-authored static/data/terrain/gw.yml (building templates +
// demo layout) with the vendored 40kdc-data terrain JSON into a single
// static/data/terrain/combined.yml. Each 40kdc piece becomes a polygon
// area_terrain entry (absolute points), and each is_objective piece becomes a
// numbered objective. Deterministic + re-runnable.
//
// Run: pnpm convert:40kdc  (or: node scripts/convert-40kdc-terrain.mjs)

import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import { resolvePiece } from "./terrain-resolver.mjs";

const srcDir = new URL("../static/data/terrain/source/40kdc/", import.meta.url);
const gwPath = new URL("../static/data/terrain/gw.yml", import.meta.url);
const outPath = new URL("../static/data/terrain/combined.yml", import.meta.url);

const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, srcDir), "utf8"));

const layouts = readJson("terrain-layouts.json");
const templates = readJson("terrain-templates.json");

const footprintById = new Map(templates.map((t) => [t.id, t.footprint]));
const lookupFootprint = (id) => footprintById.get(id);

// Theme label per piece. Area pieces share one translucent-zone style; feature
// pieces are coloured by material category, mirroring the demo layout's palette
// (green ruins, rust pipes, gunmetal generators, sand barricades, metal
// gantries/catwalks). Unknown feature templates fall back to the generic
// `feature` style. Categories resolve to colours in static/data/theme.yml.
const FEATURE_LABELS = {
  "corner-tiny": "ruin",
  "corner-short": "ruin",
  "corner-ruin-balanced-left": "ruin",
  "corner-ruin-balanced-right": "ruin",
  "corner-ruin-left": "ruin",
  "corner-ruin-right": "ruin",
  pipe: "pipe",
  generator: "generator",
  barricade: "barricade",
  gantry: "gantry",
  catwalk: "catwalk",
};

const labelFor = (piece) =>
  piece.piece_type === "area" ? "area" : (FEATURE_LABELS[piece.template] ?? "feature");

// Round to 3 decimals and normalise negative zero to 0 so the YAML never
// carries `-0` (which the preset serializer collapses to `0`, causing a
// spurious mismatch in presets.test.ts).
const round = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
};

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
  const area_terrain = [];
  const objectives = [];
  let objNumber = 1;
  for (const piece of layout.pieces) {
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
    if (piece.is_objective) {
      objectives.push({
        x: round(piece.position.x),
        y: round(piece.position.y),
        number: objNumber++,
      });
    }
  }
  const entry = { buildings: [], area_terrain };
  if (objectives.length > 0) entry.objectives = objectives;
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
