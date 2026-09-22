import { describe, it, expect } from "vitest";
import { objectiveIcons } from "./objective-icons.mjs";
import { loadCorpus } from "./terrain-corpus.mjs";
import { round } from "./emit-placement.mjs";

const { missionLayouts } = loadCorpus();
const layoutById = (id) => missionLayouts.find((l) => l.id === id);

const iconsFor = (id) => objectiveIcons(layoutById(id));

describe("objectiveIcons", () => {
  it("merges the touching central objective pair into a single marker", () => {
    // Six objective pieces: four spread-out `area-large` and a touching
    // central pair of `area-trapezoid`.
    const icons = iconsFor("bm-take-vs-take-01");
    expect(icons).toHaveLength(5);
    const centre = icons.filter((i) => i.pos.x === 30 && i.pos.y === 22);
    expect(centre).toHaveLength(1);
  });

  it("keeps a non-touching central objective pair as two markers", () => {
    // Same six objectives, but the central trapezoids sit ~6in apart.
    const icons = iconsFor("bm-take-vs-prio-01");
    expect(icons).toHaveLength(6);
  });

  it("renders home objectives with the fortress (home) icon, others with skull", () => {
    // Five markers: 1 center (collapsed pair) + 2 home + 2 expansion.
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
    // Only a missing piece distinguishes reading `this.pieces` from closing
    // over the original list.
    const layout = layoutById("bm-take-vs-take-01");
    const dropped = layout.pieces[0];
    const narrowed = layout.withPieces(
      layout.pieces.filter((p) => p.id !== dropped.id),
    );
    expect(layout.parentOf(dropped.id)).toBe(dropped);
    expect(narrowed.parentOf(dropped.id)).toBeUndefined();
    // A bare spread works as well as `withPieces`.
    expect({ ...layout, pieces: narrowed.pieces }.parentOf(dropped.id)).toBeUndefined();
    expect(objectiveIcons(layout.withPieces([...layout.pieces]))).toEqual(
      objectiveIcons(layout),
    );
  });

  // These objectives are parentless, so the test above never reaches the
  // clustering. Removing one of the touching central pair leaves the survivor
  // to emit alone where it sits, off (30, 22).
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
    // No vendored layout is objective-free, so strip them.
    const layout = layoutById("bm-take-vs-take-01");
    const pieces = layout.pieces.filter((p) => !p.is_objective && !p.objective_role);
    const icons = objectiveIcons(layout.withPieces(pieces));
    expect(icons).toEqual([]);
  });
});
