// Converts the vendored 40kdc-data terrain JSON into static/data/terrain/40kdc.yml.
// Each piece becomes a polygon area_terrain entry (absolute points), and each
// is_objective piece becomes a numbered objective. Deterministic + re-runnable.
//
// Run: node scripts/convert-40kdc-terrain.mjs

import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import { resolvePiece } from "./terrain-resolver.mjs";

const srcDir = new URL("../static/data/terrain/source/40kdc/", import.meta.url);
const outPath = new URL("../static/data/terrain/40kdc.yml", import.meta.url);

const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, srcDir), "utf8"));

const layouts = readJson("terrain-layouts.json");
const templates = readJson("terrain-templates.json");

const footprintById = new Map(templates.map((t) => [t.id, t.footprint]));
const lookupFootprint = (id) => footprintById.get(id);

const round = (n) => Math.round(n * 1000) / 1000;

const out = { templates: {}, layout: {} };

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
      label: piece.piece_type === "area" ? "area" : "feature",
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
  "# Produced by scripts/convert-40kdc-terrain.mjs from the vendored\n" +
  "# 40kdc-data JSON under static/data/terrain/source/40kdc/.\n" +
  "# Regenerate with: node scripts/convert-40kdc-terrain.mjs\n\n";

writeFileSync(outPath, header + yaml.dump(out, { lineWidth: 100 }), "utf8");
console.log(
  `Wrote ${Object.keys(out.layout).length} layouts to static/data/terrain/40kdc.yml`,
);
