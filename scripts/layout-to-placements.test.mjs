import { describe, it, expect } from "vitest";
import { loadCorpus, withLookups } from "./terrain-corpus.mjs";
import { areaBuildingPlacement } from "./area-to-building.mjs";
import { ruinFeaturePlacement, isRuinTemplate } from "./ruin-to-feature.mjs";
import { rectFeaturePlacement } from "./rect-to-feature.mjs";
import { featureBuildingPlacement } from "./feature-to-building.mjs";
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

describe("classifyPiece", () => {
  it("types an `area` piece as an area building", () => {
    const p = piece({ piece_type: "area", template: "area-large" });
    expect(classifyPiece(p, footprintOf)).toBe(PIECE_KINDS.areaBuilding);
  });

  it("types a whole-L corner piece as a ruin feature", () => {
    const p = piece({ template: "corner-short", footprint: L_FOOTPRINT });
    expect(classifyPiece(p, footprintOf)).toBe(PIECE_KINDS.ruinFeature);
  });

  it("types a corner piece with a non-L footprint as area terrain", () => {
    const p = piece({ template: "corner-bar", footprint: BAR_FOOTPRINT });
    expect(classifyPiece(p, footprintOf)).toBe(PIECE_KINDS.areaTerrain);
  });

  it("drops catwalk pieces", () => {
    const p = piece({ template: "catwalk" });
    expect(classifyPiece(p, footprintOf)).toBe(PIECE_KINDS.dropped);
  });

  it("types generators and gantries as rectangle features", () => {
    for (const template of ["generator", "gantry"]) {
      expect(classifyPiece(piece({ template }), footprintOf)).toBe(
        PIECE_KINDS.rectFeature,
      );
    }
  });

  it("types pipes and barricades as feature buildings", () => {
    for (const template of ["pipe", "barricade"]) {
      expect(classifyPiece(piece({ template }), footprintOf)).toBe(
        PIECE_KINDS.featureBuilding,
      );
    }
  });

  it("falls back to area terrain for an unmapped feature template", () => {
    const p = piece({ template: "mystery", footprint: BAR_FOOTPRINT });
    expect(classifyPiece(p, footprintOf)).toBe(PIECE_KINDS.areaTerrain);
  });

  it("throws when a piece matches two kinds", () => {
    const p = piece({ id: "amb", piece_type: "area", template: "generator" });
    expect(() => classifyPiece(p, footprintOf)).toThrow(/amb/);
  });
});

describe("layoutPlacements", () => {
  const L = missionLayouts.find(
    (l) => l.id === "purge-the-foe-vs-purge-the-foe-2",
  );

  it("emits every piece exactly once, dropping only the catwalks", () => {
    for (const layout of missionLayouts) {
      const { templates, features, areaTerrain } = layoutPlacements(
        layout,
        gwTemplates,
      );
      const dropped = layout.pieces.filter(
        (p) => classifyPiece(p, layout.footprintOf) === PIECE_KINDS.dropped,
      );
      // The dropped set is exactly the catwalks - the corpus-wide count lives
      // in ruin-to-feature.test.mjs; here we only pin what was dropped.
      expect(dropped.length, layout.id).toBe(
        layout.pieces.filter((p) => p.template === "catwalk").length,
      );
      expect(
        templates.length + features.length + areaTerrain.length,
        layout.id,
      ).toBe(layout.pieces.length - dropped.length);
    }
  });

  it("keeps areas before feature buildings and ruins before rectangles", () => {
    const kinds = L.pieces.map((p) => classifyPiece(p, L.footprintOf));
    const of = (kind) => L.pieces.filter((_, i) => kinds[i] === kind);
    expect(layoutPlacements(L, gwTemplates).templates).toEqual([
      ...of(PIECE_KINDS.areaBuilding).map((p) =>
        areaBuildingPlacement(p, L.footprintOf(p.template), gwTemplates),
      ),
      ...of(PIECE_KINDS.featureBuilding).map((p) =>
        featureBuildingPlacement(p, L.footprintOf, L.parentOf),
      ),
    ]);
    expect(layoutPlacements(L, gwTemplates).features).toEqual([
      ...of(PIECE_KINDS.ruinFeature).map((p) =>
        ruinFeaturePlacement(p, L.footprintOf, L.parentOf),
      ),
      ...of(PIECE_KINDS.rectFeature).map((p) =>
        rectFeaturePlacement(p, L.footprintOf, L.parentOf),
      ),
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

  it("emits an absolute polygon for an unclassified feature piece", () => {
    const layout = withLookups(
      {
        id: "synthetic",
        pieces: [
          piece({ id: "m1", template: "mystery", footprint: BAR_FOOTPRINT }),
        ],
      },
      footprintOf,
    );
    const { templates, features, areaTerrain } = layoutPlacements(
      layout,
      gwTemplates,
    );
    expect(templates).toEqual([]);
    expect(features).toEqual([]);
    expect(areaTerrain).toEqual([
      {
        shape: "polygon",
        x: 0,
        y: 0,
        points: layout.resolve(layout.pieces[0]),
        label: "feature",
      },
    ]);
  });
});
