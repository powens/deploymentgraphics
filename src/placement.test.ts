import { describe, it, expect } from "vitest";
import {
  mirror,
  placeBuildings,
  placedTransform,
  resolveFeature,
  resolvePlacement,
  type Placed,
} from "./placement";
import type { Template } from "./building-coordinates";

const canvas = { width: 60, height: 44 };
const templates: Record<string, Template> = {
  "4x6": { width: 4, height: 6 },
  "3x4": { width: 3, height: 4 },
};

describe("resolvePlacement (canonical Placed)", () => {
  it("resolves a single-corner placement to a centre-pivot box at rotation 0", () => {
    const [primary] = resolvePlacement(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 } } },
      templates,
      canvas,
    );
    expect(primary).toEqual({
      name: "4x6",
      box: { x: 10, y: 5, width: 4, height: 6 },
      rotation: 0,
    });
  });

  it("keeps the box top-left invariant under a 90-degree rotation", () => {
    // 3x4 rotated 90deg about its centre: the unrotated box top-left stays the
    // anchor; rotation is carried separately.
    const [primary] = resolvePlacement(
      { type: "3x4", mirror: false, corners: { TL: { x: 20, y: 10 }, BR: { x: 16, y: 13 } } },
      templates,
      canvas,
    );
    expect(primary.rotation).toBeCloseTo(90, 5);
    expect(primary.box.width).toBe(3);
    expect(primary.box.height).toBe(4);
  });

  it("throws when a corner pair disagrees with the template edge", () => {
    expect(() =>
      resolvePlacement(
        { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 20, y: 5 } } },
        templates,
        canvas,
      ),
    ).toThrow(/measure .* apart but template edge/);
  });

  it("throws on an unknown template", () => {
    expect(() =>
      resolvePlacement({ type: "ghost", corners: { TL: { x: 0, y: 0 } } }, templates, canvas),
    ).toThrow(/unknown template/);
  });
});

describe("mirror default", () => {
  it("emits a point-reflected copy by default", () => {
    const result = resolvePlacement(
      { type: "4x6", corners: { TL: { x: 10, y: 5 } } },
      templates,
      canvas,
    );
    expect(result).toHaveLength(2);
    expect(result[1].box).toEqual({ x: 46, y: 33, width: 4, height: 6 });
    expect(result[1].rotation).toBe(180);
  });

  it("emits only the primary when mirror is false", () => {
    expect(
      resolvePlacement({ type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 } } }, templates, canvas),
    ).toHaveLength(1);
  });
});

describe("mirror", () => {
  it("point-reflects a Placed through the canvas centre", () => {
    const placed: Placed = { name: "x", box: { x: 10, y: 5, width: 4, height: 6 }, rotation: 30 };
    expect(mirror(placed, canvas)).toEqual({
      name: "x",
      box: { x: 46, y: 33, width: 4, height: 6 },
      rotation: 210,
    });
  });

  it("is an involution (modulo the 360 wrap)", () => {
    const placed: Placed = { name: "x", box: { x: 7, y: 9, width: 5, height: 2 }, rotation: 40 };
    const back = mirror(mirror(placed, canvas), canvas);
    expect(back.box).toEqual(placed.box);
    expect(back.rotation % 360).toBe(placed.rotation % 360);
  });
});

describe("resolveFeature", () => {
  it("treats the placement as the primary box and mirror-expands it", () => {
    const result = resolveFeature(
      { type: "pipe", x: 12, y: 6, width: 10, height: 2.5, rotation: 45, color: "rust" },
      canvas,
    );
    expect(result[0]).toEqual({
      name: "pipe",
      box: { x: 12, y: 6, width: 10, height: 2.5 },
      rotation: 45,
    });
    expect(result[1].box).toEqual({ x: 38, y: 35.5, width: 10, height: 2.5 });
    expect(result[1].rotation).toBe(225);
  });
});

describe("placeBuildings", () => {
  it("flattens placements to mirror-expanded Placed", () => {
    const result = placeBuildings(
      [
        { type: "4x6", corners: { TL: { x: 10, y: 5 } } }, // 2 (primary + mirror)
        { type: "3x4", mirror: false, corners: { TL: { x: 20, y: 10 } } }, // 1
      ],
      templates,
      canvas,
    );
    expect(result).toHaveLength(3);
  });
});

describe("placedTransform (centre-pivot draw string)", () => {
  // The single owner of the centre-pivot convention every Placed renderer
  // (buildings, features) draws with: translate to the box top-left, then
  // rotate about the box centre (width/2, height/2).
  it("translates to the box top-left and rotates about the box centre", () => {
    const placed: Placed = {
      name: "x",
      box: { x: 10, y: 8, width: 5, height: 3 },
      rotation: 30,
    };
    expect(placedTransform(placed)).toBe("translate(10 8) rotate(30 2.5 1.5)");
  });

  it("emits rotation 0 about the centre for an unrotated piece at the origin", () => {
    const placed: Placed = {
      name: "x",
      box: { x: 0, y: 0, width: 4, height: 6 },
      rotation: 0,
    };
    expect(placedTransform(placed)).toBe("translate(0 0) rotate(0 2 3)");
  });
});
