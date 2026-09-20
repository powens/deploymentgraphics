import { describe, it, expect } from "vitest";
import { objectiveIcons } from "./objective-icons.mjs";
import { loadCorpus } from "./terrain-corpus.mjs";
import { round } from "./emit-placement.mjs";

const { missionLayouts } = loadCorpus();
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

  it("reads a narrowed layout against its own pieces", () => {
    // This used to be a guard: deriving a layout by spreading dropped the
    // non-enumerable lookups, nothing resolved, and the central pair split
    // into two markers instead of collapsing to one - so objectiveIcons threw
    // rather than emit quietly-wrong geometry. The lookups are methods now,
    // so a derived layout resolves against *its* pieces and the guard is gone.
    //
    // Which means the derivation has to actually narrow to say anything: a
    // `parentOf` still closing over the list it was wrapped with answers a
    // same-contents copy identically, so only a *missing* piece tells the two
    // apart.
    const layout = layoutById("bm-take-vs-take-01");
    const dropped = layout.pieces[0];
    const narrowed = layout.withPieces(
      layout.pieces.filter((p) => p.id !== dropped.id),
    );
    expect(layout.parentOf(dropped.id)).toBe(dropped);
    expect(narrowed.parentOf(dropped.id)).toBeUndefined();
    // ...and a bare spread is as good as `withPieces`, which is the mistake the
    // deleted guard existed to catch.
    expect({ ...layout, pieces: narrowed.pieces }.parentOf(dropped.id)).toBeUndefined();
    // Narrowing nothing away still emits the whole card.
    expect(objectiveIcons(layout.withPieces([...layout.pieces]))).toEqual(
      objectiveIcons(layout),
    );
  });

  // The pass above pins `parentOf` against a narrowed list, and is what would
  // fail if the lookups went back to closing over the list they were built
  // from. This pins the clustering itself, which that pass does not reach:
  // these objectives are parentless areas, so `parentOf` is never consulted
  // for them and a stale closure would not move a marker.
  //
  // What it replaces was `objectiveIcons(withPieces([...pieces]))` against the
  // unnarrowed card - a same-contents copy, which agrees whatever the layout
  // reads its pieces off, so it could not fail. Drop a piece instead:
  // `bm-take-vs-take-01`'s two central objectives touch, so its six pieces
  // emit five markers with the pair collapsed onto (30, 22); remove one and
  // the survivor has nothing to cluster with and emits alone where it sits.
  it("clusters over a narrowed layout's own pieces", () => {
    const layout = layoutById("bm-take-vs-take-01");
    expect(layout.pieces.filter((p) => p.is_objective)).toHaveLength(6);
    expect(objectiveIcons(layout)).toContainEqual({
      type: "skull",
      pos: { x: 30, y: 22 },
    });

    const narrowed = layout.withPieces(
      layout.pieces.filter((p) => p.id !== "area-03"),
    );
    const icons = objectiveIcons(narrowed);
    expect(icons).toHaveLength(5);
    expect(icons).not.toContainEqual({ type: "skull", pos: { x: 30, y: 22 } });
    expect(icons).toContainEqual({
      type: "skull",
      pos: { x: 32.064, y: 20.615 },
    });
  });

  it("returns no icons for a layout without objectives", () => {
    // No vendored layout is objective-free, so strip the objective pieces from
    // bm-take-vs-take-01: the remaining terrain carries no objective_role,
    // and objectiveIcons emits nothing.
    const layout = layoutById("bm-take-vs-take-01");
    const pieces = layout.pieces.filter((p) => !p.is_objective && !p.objective_role);
    const icons = objectiveIcons(layout.withPieces(pieces));
    expect(icons).toEqual([]);
  });
});
