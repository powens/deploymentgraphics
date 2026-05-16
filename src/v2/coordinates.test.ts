import { describe, it, expect } from "vitest";
import {
  getAnchor,
  getCoordinates,
  getHiddenSuppliesCoords,
  isCenterObjective,
} from "./coordinates";
import type { FullConfig } from "./types";

// Minimal config — only `base.size` is read by these helpers.
const config = { base: { size: { width: 60, height: 44 } } } as FullConfig;

describe("getAnchor", () => {
  it("returns each canvas corner", () => {
    expect(getAnchor(config, "TOP_LEFT")).toEqual([0, 0]);
    expect(getAnchor(config, "TOP_RIGHT")).toEqual([60, 0]);
    expect(getAnchor(config, "BOTTOM_LEFT")).toEqual([0, 44]);
    expect(getAnchor(config, "BOTTOM_RIGHT")).toEqual([60, 44]);
  });
});

describe("getCoordinates", () => {
  it("defaults to the top-left anchor (no translation)", () => {
    expect(getCoordinates(config, [10, 5])).toEqual([10, 5]);
  });

  it("offsets by the named anchor", () => {
    expect(getCoordinates(config, [10, 5], "BOTTOM_RIGHT")).toEqual([70, 49]);
  });
});

describe("isCenterObjective", () => {
  it("is true only at the origin", () => {
    expect(isCenterObjective([0, 0])).toBe(true);
    expect(isCenterObjective([0, 1])).toBe(false);
    expect(isCenterObjective([1, 0])).toBe(false);
  });
});

describe("getHiddenSuppliesCoords", () => {
  it("returns the fixed hidden-supplies offset", () => {
    expect(getHiddenSuppliesCoords()).toEqual([4.8, 3.5]);
  });
});
