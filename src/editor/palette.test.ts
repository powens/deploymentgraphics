import { describe, it, expect } from "vitest";
import { buildPaletteItems, createObjectFromPalette } from "./palette.js";
import { emptyScene } from "./scene.js";

describe("feature palette items", () => {
  it("includes the canonical feature entries", () => {
    const labels = buildPaletteItems({}).map((i) =>
      i.category === "feature" ? i.label : null,
    );
    expect(labels).toContain("L-ruin 5×7");
    expect(labels).toContain("Generator 5×3");
  });

  it("includes the mirrored L-ruin variants the renderer supports", () => {
    const featureTypes = buildPaletteItems({})
      .filter((i) => i.category === "feature")
      .map((i) => (i.category === "feature" ? i.featureType : null));
    expect(featureTypes).toContain("l-ruin-mirror");
    expect(featureTypes).toContain("l-ruin-roof-mirror");
  });

  it("creates a feature scene object with size and colour from the item", () => {
    const item = {
      category: "feature" as const,
      featureType: "generator" as const,
      width: 5,
      height: 3,
      color: "gunmetal",
      label: "Generator 5×3",
    };
    const obj = createObjectFromPalette(item, 4, 9, emptyScene());
    expect(obj).toMatchObject({
      type: "feature",
      featureType: "generator",
      x: 4,
      y: 9,
      width: 5,
      height: 3,
      color: "gunmetal",
      rotation: 0,
    });
  });
});
