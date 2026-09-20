import { describe, it, expect } from "vitest";
import { loadCorpus, withLookups } from "./terrain-corpus.mjs";
import { resolvePiece } from "./terrain-resolver.mjs";

const corpus = loadCorpus();

describe("loadCorpus", () => {
  it("selects the mission layouts as those carrying a matchup, in source order", () => {
    expect(corpus.missionLayouts.map((l) => l.id)).toEqual(
      corpus.rawLayouts.filter((l) => l.mission_matchup_id).map((l) => l.id),
    );
    expect(corpus.missionLayouts.length).toBeGreaterThan(0);
    expect(corpus.missionLayouts.length).toBeLessThan(corpus.rawLayouts.length);
  });

  it("normalizes the mission layouts, leaving rawLayouts on the upstream shape", () => {
    // The composite templates upstream introduced are what normalizeLayout
    // rewrites away; they must be gone from `missionLayouts` and still present
    // in `rawLayouts`, which the registration test compares against.
    // Upstream's own prefix, read directly: the module that maps it away no
    // longer exports the predicate, and a test of what normalizeLayout removed
    // should be reading upstream's vocabulary rather than the module's.
    const composites = (ls) =>
      ls.flatMap((l) => l.pieces).filter((p) =>
        p.template?.startsWith("bm-composite-"),
      );
    expect(composites(corpus.rawLayouts).length).toBeGreaterThan(0);
    expect(composites(corpus.missionLayouts)).toEqual([]);
  });

  it("resolves a template id to its upstream footprint", () => {
    for (const [id, template] of corpus.templatesById) {
      expect(corpus.footprintOf(id)).toBe(template.footprint);
    }
    expect(corpus.footprintOf("no-such-template")).toBeUndefined();
  });

  it("exposes the gw building templates the area placements size against", () => {
    expect(Object.keys(corpus.gwTemplates).length).toBeGreaterThan(0);
  });
});

describe("withLookups", () => {
  it("keeps the layout's own fields readable", () => {
    for (const layout of corpus.missionLayouts) {
      expect(layout.id).toBeTypeOf("string");
      expect(Array.isArray(layout.pieces)).toBe(true);
    }
  });

  it("finds a parent piece by id within its own layout", () => {
    for (const layout of corpus.missionLayouts) {
      for (const piece of layout.pieces) {
        expect(layout.parentOf(piece.id)).toBe(piece);
      }
      expect(layout.parentOf("no-such-piece")).toBeUndefined();
    }
  });

  it("scopes parentOf to one layout", () => {
    // Two layouts can share piece ids; each layout must only see its own.
    const [a, b] = corpus.missionLayouts;
    const pieceOfB = b.pieces[0];
    expect(a.parentOf(pieceOfB.id)).not.toBe(pieceOfB);
  });

  it("resolves a piece exactly as resolvePiece does", () => {
    let checked = 0;
    for (const layout of corpus.missionLayouts) {
      for (const piece of layout.pieces) {
        expect(layout.resolve(piece)).toEqual(
          resolvePiece(piece, corpus.footprintOf, layout.parentOf),
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("wraps a layout that never went through loadCorpus", () => {
    const layout = {
      id: "synthetic",
      pieces: [
        {
          id: "p1",
          footprint: { type: "rectangle", width: 4, height: 2 },
          position: { x: 10, y: 10 },
        },
      ],
    };
    const wrapped = withLookups(layout, () => undefined);
    expect(wrapped.id).toBe("synthetic");
    expect(wrapped.parentOf("p1")).toBe(layout.pieces[0]);
    expect(wrapped.resolve(layout.pieces[0])).toEqual([
      { x: 8, y: 9 },
      { x: 12, y: 9 },
      { x: 12, y: 11 },
      { x: 8, y: 11 },
    ]);
  });
});

describe("the lookups do not survive a spread", () => {
  it("drops them, so a derived layout cannot resolve against stale parents", () => {
    const layout = corpus.missionLayouts[0];
    const derived = { ...layout, pieces: layout.pieces.slice(0, 1) };
    expect(derived.parentOf).toBeUndefined();
    expect(derived.resolve).toBeUndefined();
    expect(derived.footprintOf).toBeUndefined();
    // Rewrapping is the supported way to derive one.
    const rewrapped = withLookups(derived, corpus.footprintOf);
    expect(rewrapped.parentOf(layout.pieces[0].id)).toBe(layout.pieces[0]);
    expect(rewrapped.parentOf(layout.pieces[1].id)).toBeUndefined();
  });
});
