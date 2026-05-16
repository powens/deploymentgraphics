import { describe, it, expect } from "vitest";
import { resolveCorner } from "./building-coordinates";

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
