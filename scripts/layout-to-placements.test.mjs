import { describe, it, expect } from "vitest";
import { loadCorpus, withLookups } from "./terrain-corpus.mjs";
import { isRuinTemplate } from "./ruin-to-feature.mjs";
import {
  PIECE_KINDS,
  classifyPiece,
  layoutPlacements,
} from "./layout-to-placements.mjs";

const { missionLayouts, gwTemplates, footprintOf } = loadCorpus();

// A whole L (three of four bbox corners present) and a plain bar, both inline
// so classification never depends on a corpus lookup.
const L_FOOTPRINT = {
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 4 },
    { x: 0, y: 4 },
  ],
};
const BAR_FOOTPRINT = { type: "rectangle", width: 4, height: 1 };

const piece = (over) => ({
  id: "p",
  piece_type: "feature",
  position: { x: 10, y: 10 },
  ...over,
});

/** The kind name one piece classifies as, through a one-piece layout. */
const kindOf = (p) =>
  classifyPiece(p, withLookups({ id: "t", pieces: [p] }, footprintOf)).kind;
/** The same, but for a piece already sitting in a corpus layout. */
const kindIn = (p, layout) => classifyPiece(p, layout).kind;

describe("classifyPiece", () => {
  it("types an `area` piece as an area building", () => {
    const p = piece({ piece_type: "area", template: "area-large" });
    expect(kindOf(p)).toBe("area-building");
  });

  it("types a whole-L corner piece as a ruin feature", () => {
    const p = piece({ template: "corner-short", footprint: L_FOOTPRINT });
    expect(kindOf(p)).toBe("ruin-feature");
  });

  it("throws on a corner piece with a non-L footprint", () => {
    // No converter draws a rotated bar as a ruin, and there is no generic
    // fallback any more (#182), so this has to fail the pull.
    const p = piece({
      id: "bar",
      template: "corner-bar",
      footprint: BAR_FOOTPRINT,
    });
    expect(() => kindOf(p)).toThrow(/matches no converter/);
  });

  it("drops catwalk pieces", () => {
    const p = piece({ template: "catwalk" });
    expect(kindOf(p)).toBe("dropped");
  });

  it("types generators and gantries as rectangle features", () => {
    for (const template of ["generator", "gantry"]) {
      expect(kindOf(piece({ template }))).toBe("rect-feature");
    }
  });

  it("types pipes and barricades as feature buildings", () => {
    for (const template of ["pipe", "barricade"]) {
      expect(kindOf(piece({ template }))).toBe("feature-building");
    }
  });

  it("throws on an unmapped feature template, naming the piece", () => {
    const p = piece({ id: "m1", template: "mystery", footprint: BAR_FOOTPRINT });
    expect(() => kindOf(p)).toThrow(
      /m1 \(feature\/mystery\) matches no converter/,
    );
  });

  it("throws when a piece matches two kinds", () => {
    const p = piece({ id: "amb", piece_type: "area", template: "generator" });
    expect(() => kindOf(p)).toThrow(/amb/);
  });
});

describe("layoutPlacements", () => {
  const L = missionLayouts.find(
    (l) => l.id === "bm-purge-vs-purge-02",
  );

  it("emits every piece exactly once, dropping only the catwalks", () => {
    for (const layout of missionLayouts) {
      const { templates, features } = layoutPlacements(layout, gwTemplates);
      const dropped = layout.pieces.filter(
        (p) => kindIn(p, layout) === "dropped",
      );
      // The dropped set is exactly the catwalks - the corpus-wide count lives
      // in ruin-to-feature.test.mjs; here we only pin what was dropped.
      expect(dropped.length, layout.id).toBe(
        layout.pieces.filter((p) => p.template === "catwalk").length,
      );
      expect(templates.length + features.length, layout.id).toBe(
        layout.pieces.length - dropped.length,
      );
    }
  });

  // This used to rebuild the dispatch by hand and `toEqual` it against
  // `layoutPlacements` - it proved the switch equalled the switch. What the
  // ordering rule actually promises is visible in the output on its own: each
  // bucket is one contiguous run per kind, in PIECE_KINDS order.
  it("keeps areas before feature buildings and ruins before rectangles", () => {
    /** Collapse a sequence to its runs, so [a,a,b,b] -> [a,b]. */
    const runs = (values) => values.filter((v, i) => v !== values[i - 1]);
    // Both buckets are told apart by the emitted row alone: pipes and
    // barricades keep their own template names, and only ruins are `l-ruin*`.
    const templateKind = (row) =>
      row.type === "pipe" || row.type === "barricade"
        ? "feature-building"
        : "area-building";
    const featureKind = (row) =>
      row.type.startsWith("l-ruin") ? "ruin-feature" : "rect-feature";

    const { templates, features } = layoutPlacements(L, gwTemplates);
    expect(runs(templates.map(templateKind))).toEqual([
      "area-building",
      "feature-building",
    ]);
    expect(runs(features.map(featureKind))).toEqual([
      "ruin-feature",
      "rect-feature",
    ]);
  });

  it("gives every kind a bucket, except the dropped one", () => {
    // The `default: throw "unhandled piece kind"` this replaces existed only
    // because the claims table and the dispatch switch were two lists that
    // could drift. One row per kind cannot, so the case is gone - but a row
    // with a converter and no bucket would still emit into nothing.
    for (const kind of PIECE_KINDS) {
      expect(Boolean(kind.convert), kind.kind).toBe(Boolean(kind.bucket));
    }
    expect(PIECE_KINDS.filter((k) => !k.convert).map((k) => k.kind)).toEqual([
      "dropped",
    ]);
  });

  it("emits every whole-L corner piece as a ruin, and no catwalk", () => {
    const { features } = layoutPlacements(L, gwTemplates);
    const ruins = features.filter((f) => f.type.startsWith("l-ruin"));
    expect(ruins.length).toBe(
      L.pieces.filter((p) => isRuinTemplate(p.template)).length,
    );
    expect(L.pieces.some((p) => p.template === "catwalk")).toBe(true);
  });

  it("emits a feature for every generator and gantry piece", () => {
    for (const layout of missionLayouts) {
      const { features } = layoutPlacements(layout, gwTemplates);
      for (const template of ["generator", "gantry"]) {
        expect(
          features.filter((f) => f.type === template).length,
          `${layout.id} ${template}`,
        ).toBe(layout.pieces.filter((p) => p.template === template).length);
      }
      for (const f of features.filter((x) => !x.type.startsWith("l-ruin"))) {
        expect(f.mirror).toBe(false);
      }
    }
  });

  it("fails the whole layout when one piece is unclaimed", () => {
    const layout = withLookups(
      {
        id: "synthetic",
        pieces: [
          piece({ id: "m1", template: "mystery", footprint: BAR_FOOTPRINT }),
        ],
      },
      footprintOf,
    );
    expect(() => layoutPlacements(layout, gwTemplates)).toThrow(
      /m1 \(feature\/mystery\) matches no converter/,
    );
  });
});
