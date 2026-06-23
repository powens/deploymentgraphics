import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { objectiveIcons } from "./objective-icons.mjs";

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../static/data/terrain/source/40kdc/${name}`, import.meta.url),
      "utf8",
    ),
  );
const layouts = read("terrain-layouts.json");
const templates = read("terrain-templates.json");
const fpById = new Map(templates.map((t) => [t.id, t.footprint]));
const lookupFootprint = (id) => fpById.get(id);

const layoutById = (id) => layouts.find((l) => l.id === id);
const iconsFor = (id) => {
  const layout = layoutById(id);
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  return objectiveIcons(layout, lookupFootprint, (pid) => byId.get(pid));
};

describe("objectiveIcons", () => {
  it("merges the touching central objective pair into a single marker", () => {
    // take-and-hold-mirror-1 has six objective pieces: four spread-out
    // `area-large` pieces and a central pair of `area-trapezoid` pieces whose
    // footprints touch. The touching pair collapses to one marker at the board
    // centre (their shared midpoint).
    const icons = iconsFor("take-and-hold-mirror-1");
    expect(icons).toHaveLength(5);
    const centre = icons.filter((i) => i.pos.x === 30 && i.pos.y === 22);
    expect(centre).toHaveLength(1);
    expect(icons.every((i) => i.type === "skull")).toBe(true);
  });

  it("keeps a non-touching central objective pair as two markers", () => {
    // take-and-hold-vs-priority-assets-1 has the same six objectives, but the
    // central trapezoids sit ~6in apart (footprints do not touch), so all six
    // remain distinct markers.
    const icons = iconsFor("take-and-hold-vs-priority-assets-1");
    expect(icons).toHaveLength(6);
  });

  it("returns no icons for a layout without objectives", () => {
    expect(iconsFor("gw-11e-crucible")).toEqual([]);
  });
});
