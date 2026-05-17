import { describe, it, expect } from "vitest";
import { getHiddenSuppliesCoords, isCenterObjective } from "./coordinates";
import type { FullConfig } from "./types";

// Minimal config — only `base.size` is read by these helpers.
const config = { base: { size: { width: 60, height: 44 } } } as FullConfig;

describe("isCenterObjective", () => {
  it("is true only at the canvas centre", () => {
    expect(isCenterObjective(config, [30, 22])).toBe(true);
    expect(isCenterObjective(config, [30, 21])).toBe(false);
    expect(isCenterObjective(config, [29, 22])).toBe(false);
    expect(isCenterObjective(config, [0, 0])).toBe(false);
  });
});

describe("getHiddenSuppliesCoords", () => {
  it("returns the fixed hidden-supplies offset", () => {
    expect(getHiddenSuppliesCoords()).toEqual([4.8, 3.5]);
  });
});
