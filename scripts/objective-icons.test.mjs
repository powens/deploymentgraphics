import { describe, it, expect } from "vitest";
import { objectiveIcons } from "./objective-icons.mjs";
import { loadCorpus, withLookups } from "./terrain-corpus.mjs";
import { round } from "./emit-placement.mjs";

const { missionLayouts, footprintOf } = loadCorpus();
const layoutById = (id) => missionLayouts.find((l) => l.id === id);

const iconsFor = (id) => objectiveIcons(layoutById(id));

describe("objectiveIcons", () => {
  it("merges the touching central objective pair into a single marker", () => {
    // bm-take-vs-take-01 has six objective pieces: four spread-out
    // `area-large` pieces and a central pair of `area-trapezoid` pieces whose
    // footprints touch. The touching pair collapses to one marker at the board
    // centre (their shared midpoint).
    const icons = iconsFor("bm-take-vs-take-01");
    expect(icons).toHaveLength(5);
    const centre = icons.filter((i) => i.pos.x === 30 && i.pos.y === 22);
    expect(centre).toHaveLength(1);
  });

  it("keeps a non-touching central objective pair as two markers", () => {
    // bm-take-vs-prio-01 has the same six objectives, but the
    // central trapezoids sit ~6in apart (footprints do not touch), so all six
    // remain distinct markers.
    const icons = iconsFor("bm-take-vs-prio-01");
    expect(icons).toHaveLength(6);
  });

  it("renders home objectives with the fortress (home) icon, others with skull", () => {
    // After the touching `center` pair collapses, this layout's five markers
    // are 1×center + 2×home + 2×expansion. The fortresses sit exactly on the
    // two `home` pieces (at the converter's 3dp); the markers carry no role.
    const layout = layoutById("bm-take-vs-take-01");
    const icons = objectiveIcons(layout);
    const at = (p) => `${round(p.x)},${round(p.y)}`;
    const homes = layout.pieces
      .filter((p) => p.is_objective && p.objective_role === "home")
      .map((p) => at(p.position))
      .sort();
    const fortresses = icons
      .filter((i) => i.type === "fortress")
      .map((i) => at(i.pos))
      .sort();
    expect(fortresses).toEqual(homes);
    expect(icons.filter((i) => i.type === "skull")).toHaveLength(3);
    for (const icon of icons) expect(icon).not.toHaveProperty("objective_role");
  });

  it("refuses a layout whose lookups were lost to a spread", () => {
    // Without `resolve` no footprint resolves, nothing touches, and the
    // central pair would silently split into two markers at the trapezoid
    // positions instead of collapsing to one at the board centre. Throw
    // rather than emit quietly-wrong geometry.
    const layout = layoutById("bm-take-vs-take-01");
    const derived = { ...layout, pieces: layout.pieces };
    expect(() => objectiveIcons(derived)).toThrow(/no resolve/);
  });

  it("returns no icons for a layout without objectives", () => {
    // No vendored layout is objective-free, so strip the objective pieces from
    // bm-take-vs-take-01: the remaining terrain carries no objective_role,
    // and objectiveIcons emits nothing.
    const layout = layoutById("bm-take-vs-take-01");
    const pieces = layout.pieces.filter((p) => !p.is_objective && !p.objective_role);
    // Rewrap rather than spread: a derived layout needs its own parent lookup,
    // not the one closed over the original piece list.
    const icons = objectiveIcons(withLookups({ ...layout, pieces }, footprintOf));
    expect(icons).toEqual([]);
  });
});
