import { describe, it, expect } from "vitest";
import { loadCorpus, withLookups } from "./terrain-corpus.mjs";
import {
  PIECE_KINDS,
  classifyPiece,
  layoutPlacements,
} from "./layout-to-placements.mjs";

const { missionLayouts, gwTemplates, footprintOf } = loadCorpus();

const BAR_FOOTPRINT = { type: "rectangle", width: 4, height: 1 };

const piece = (over) => ({
  id: "p",
  piece_type: "feature",
  position: { x: 10, y: 10 },
  ...over,
});

const kindOf = (p) => classifyPiece(p).kind;

describe("classifyPiece", () => {
  it("types an `area` piece as an area building", () => {
    const p = piece({ piece_type: "area", template: "area-large" });
    expect(kindOf(p)).toBe("area-building");
  });

  it("types every L-ruin part as a ruin feature", () => {
    for (const part of ["ab", "cd", "co", "corner", "ef", "gh", "small-l", "small-l-flip"]) {
      expect(kindOf(piece({ part })), part).toBe("ruin-feature");
    }
  });

  it("types generators and towers as rectangle features", () => {
    for (const part of ["generator", "tower"]) {
      expect(kindOf(piece({ part }))).toBe("rect-feature");
    }
  });

  it("types the barriers as feature buildings", () => {
    for (const part of ["long-barrier", "short-barrier"]) {
      expect(kindOf(piece({ part }))).toBe("feature-building");
    }
  });

  // Dropping is battlemaster-normalize.mjs's job, so a dropped part arriving
  // here is as unknown as any other.
  it("throws on a part the pipeline does not draw, naming the piece", () => {
    const p = piece({ id: "m1", part: "pipes", footprint: BAR_FOOTPRINT });
    expect(() => kindOf(p)).toThrow(
      /m1 \(feature\/pipes\) matches no converter/,
    );
  });

  it("throws when a piece matches two kinds", () => {
    const p = piece({ id: "amb", piece_type: "area", part: "generator" });
    expect(() => kindOf(p)).toThrow(/amb/);
  });
});

describe("layoutPlacements", () => {
  const L = missionLayouts.find(
    (l) => l.id === "bm-purge-vs-purge-02",
  );

  it("emits every piece exactly once", () => {
    for (const layout of missionLayouts) {
      const { templates, features } = layoutPlacements(layout, gwTemplates);
      expect(templates.length + features.length, layout.id).toBe(
        layout.pieces.length,
      );
    }
  });

  // Each bucket is one contiguous run per kind, in PIECE_KINDS order.
  it("keeps areas before feature buildings and ruins before rectangles", () => {
    /** [a,a,b,b] -> [a,b] */
    const runs = (values) => values.filter((v, i) => v !== values[i - 1]);
    // Keyed on the gw area names, not `isFeatureBuildingPart` (which reads
    // Battlemaster parts), so a feature building under any new gw name still
    // counts as one.
    const AREA_GW_NAMES = new Set([
      "large-area",
      "small-area",
      "large-pipes",
      "small-pipes",
      "shoe",
      "shoe-mirror",
    ]);
    const templateKind = (row) =>
      AREA_GW_NAMES.has(row.type) ? "area-building" : "feature-building";
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

  it("gives every kind a converter and a bucket", () => {
    // A converter with no bucket, or an unknown one, would emit into nothing.
    const emitted = Object.keys(layoutPlacements(L, gwTemplates));
    for (const kind of PIECE_KINDS) {
      expect(typeof kind.convert, kind.kind).toBe("function");
      expect(emitted, kind.kind).toContain(kind.bucket);
    }
  });

  it("emits a feature for every generator and tower piece", () => {
    for (const layout of missionLayouts) {
      const { features } = layoutPlacements(layout, gwTemplates);
      for (const [part, type] of [["generator", "generator"], ["tower", "gantry"]]) {
        expect(
          features.filter((f) => f.type === type).length,
          `${layout.id} ${part}`,
        ).toBe(layout.pieces.filter((p) => p.part === part).length);
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
          piece({ id: "m1", part: "mystery", footprint: BAR_FOOTPRINT }),
        ],
      },
      footprintOf,
    );
    expect(() => layoutPlacements(layout, gwTemplates)).toThrow(
      /m1 \(feature\/mystery\) matches no converter/,
    );
  });
});
