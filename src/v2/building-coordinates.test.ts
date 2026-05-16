import { describe, it, expect } from "vitest";
import { resolveCorner, resolveBuilding } from "./building-coordinates";

const canvas = { width: 60, height: 44 };

describe("resolveCorner", () => {
  it("resolves from TL (x,y are inward distances)", () => {
    expect(resolveCorner([10, 5], "TL", canvas)).toEqual([10, 5]);
  });

  it("resolves from TR", () => {
    expect(resolveCorner([10, 5], "TR", canvas)).toEqual([50, 5]);
  });

  it("resolves from BL", () => {
    expect(resolveCorner([10, 5], "BL", canvas)).toEqual([10, 39]);
  });

  it("resolves from BR", () => {
    expect(resolveCorner([10, 5], "BR", canvas)).toEqual([50, 39]);
  });

  it("lets a 3rd element override the default anchor", () => {
    expect(resolveCorner([10, 5, "TL"], "BR", canvas)).toEqual([10, 5]);
  });
});

const templates = {
  "4x6": { width: 4, height: 6 },
  "6x12": { width: 6, height: 12 },
  "3x4": { width: 3, height: 4 },
};

describe("resolveBuilding (single, non-mirrored)", () => {
  it("places an axis-aligned building from TL", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [14, 5] } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0].templateName).toBe("4x6");
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a building rotated by a known angle (90 degrees)", () => {
    const result = resolveBuilding(
      { type: "6x12", mirror: false, corners: { TL: [20, 10], TR: [20, 16] } },
      templates,
      canvas,
    );
    expect(result[0].translate[0]).toBeCloseTo(20);
    expect(result[0].translate[1]).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(90);
  });

  it("resolves the two corners from different canvas anchors", () => {
    const result = resolveBuilding(
      { type: "4x6", mirror: false, corners: { TL: [10, 5], TR: [46, 5, "TR"] } },
      templates,
      canvas,
    );
    // [46,5,TR] -> (60-46, 5) = (14,5): same building as the axis-aligned case
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(5);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a building defined by a diagonal corner pair", () => {
    const result = resolveBuilding(
      { type: "3x4", mirror: false, corners: { TL: [10, 10], BR: [13, 14] } },
      templates,
      canvas,
    );
    expect(result[0].translate[0]).toBeCloseTo(10);
    expect(result[0].translate[1]).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(0);
  });

  it("places a diagonal corner pair with a non-zero rotation", () => {
    // 3x4 template (local diagonal TL->BR = (3,4)) rotated 90 degrees.
    // rotate((3,4), 90deg) = (-4,3), so BR sits at TL + (-4,3).
    const result = resolveBuilding(
      { type: "3x4", mirror: false, corners: { TL: [20, 10], BR: [16, 13] } },
      templates,
      canvas,
    );
    expect(result[0].translate[0]).toBeCloseTo(20);
    expect(result[0].translate[1]).toBeCloseTo(10);
    expect(result[0].rotation).toBeCloseTo(90);
  });
});
