import { describe, it, expect } from "vitest";
import { objectiveIcons } from "./objective-icons.mjs";
import { loadCorpus, withLookups } from "./terrain-corpus.mjs";

const { layout: layoutById, footprintOf } = loadCorpus();

const iconsFor = (id) => objectiveIcons(layoutById(id));

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
  });

  it("keeps a non-touching central objective pair as two markers", () => {
    // take-and-hold-vs-priority-assets-1 has the same six objectives, but the
    // central trapezoids sit ~6in apart (footprints do not touch), so all six
    // remain distinct markers.
    const icons = iconsFor("take-and-hold-vs-priority-assets-1");
    expect(icons).toHaveLength(6);
  });

  it("carries each piece's objective_role through to its marker", () => {
    // Every objective in this layout is a `center`/`home`/`expansion` pair;
    // after the touching `center` pair collapses, the five markers expose the
    // roles 1×center + 2×home + 2×expansion.
    const icons = iconsFor("take-and-hold-mirror-1");
    const roles = icons.map((i) => i.objective_role).sort();
    expect(roles).toEqual(["center", "expansion", "expansion", "home", "home"]);
  });

  it("renders home objectives with the fortress (home) icon, others with skull", () => {
    const icons = iconsFor("take-and-hold-mirror-1");
    for (const icon of icons) {
      const expected = icon.objective_role === "home" ? "fortress" : "skull";
      expect(icon.type).toBe(expected);
    }
    expect(icons.filter((i) => i.type === "fortress")).toHaveLength(2);
  });

  it("refuses a layout whose lookups were lost to a spread", () => {
    // Without `resolve` no footprint resolves, nothing touches, and the
    // central pair would silently split into two markers at the trapezoid
    // positions instead of collapsing to one at the board centre. Throw
    // rather than emit quietly-wrong geometry.
    const layout = layoutById("take-and-hold-mirror-1");
    const derived = { ...layout, pieces: layout.pieces };
    expect(() => objectiveIcons(derived)).toThrow(/no resolve/);
  });

  it("returns no icons for a layout without objectives", () => {
    // No vendored layout is objective-free, so strip the objective pieces from
    // take-and-hold-mirror-1: the remaining terrain carries no objective_role,
    // and objectiveIcons emits nothing.
    const layout = layoutById("take-and-hold-mirror-1");
    const pieces = layout.pieces.filter((p) => !p.is_objective && !p.objective_role);
    // Rewrap rather than spread: a derived layout needs its own parent lookup,
    // not the one closed over the original piece list.
    const icons = objectiveIcons(withLookups({ ...layout, pieces }, footprintOf));
    expect(icons).toEqual([]);
  });
});
