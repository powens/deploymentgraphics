import { describe, it, expect } from "vitest";
import {
  decompose,
  decomposeBuilding,
  mirror,
  placeBuildings,
  resolveBuilding,
  resolveFeature,
  resolvePlacement,
  type Placed,
  type ResolvedBuilding,
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

describe("decomposeBuilding (origin-pivot → corner-pin)", () => {
  it("pins TL at the translate and TR along the rotated top edge", () => {
    const r: ResolvedBuilding = {
      templateName: "4x6",
      translate: { x: 10, y: 8 },
      rotation: 90,
    };
    const p = decomposeBuilding(r, templates);
    expect(p.type).toBe("4x6");
    expect(p.corners.TL).toEqual({ x: 10, y: 8 });
    // TR = translate + width * (cos θ, sin θ); width of 4x6 is 4, θ = 90°
    expect((p.corners.TR as { x: number; y: number }).x).toBeCloseTo(10, 5);
    expect((p.corners.TR as { x: number; y: number }).y).toBeCloseTo(12, 5);
  });
});

describe("resolveBuilding ∘ decomposeBuilding round-trip", () => {
  // The inverse locks the editor's origin-pivot decomposition to the renderer's
  // forward resolveBuilding — a property that could not be tested while the
  // inverse lived in the editor's scene module.
  for (const [label, r] of [
    ["axis-aligned", { templateName: "4x6", translate: { x: 10, y: 8 }, rotation: 0 }],
    ["rotated 90", { templateName: "4x6", translate: { x: 10, y: 8 }, rotation: 90 }],
    ["rotated 37", { templateName: "3x4", translate: { x: 20, y: 6 }, rotation: 37 }],
  ] as const) {
    it(`recovers the same origin-pivot building (${label})`, () => {
      const [back] = resolveBuilding(decomposeBuilding(r, templates), templates, canvas);
      expect(back.templateName).toBe(r.templateName);
      expect(back.translate.x).toBeCloseTo(r.translate.x, 6);
      expect(back.translate.y).toBeCloseTo(r.translate.y, 6);
      expect(back.rotation).toBeCloseTo(r.rotation, 6);
    });
  }
});

describe("decompose ∘ resolvePlacement round-trip", () => {
  // The inverse locks the editor's decomposition to the renderer's forward
  // resolve — a property that could not be tested when the two lived in
  // different modules.
  for (const [label, placement] of [
    ["axis-aligned", { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 } } }],
    ["rotated 90", { type: "3x4", mirror: false, corners: { TL: { x: 20, y: 10 }, BR: { x: 16, y: 13 } } }],
  ] as const) {
    it(`recovers the same Placed (${label})`, () => {
      const [primary] = resolvePlacement(placement, templates, canvas);
      const [roundTripped] = resolvePlacement(decompose(primary), templates, canvas);
      expect(roundTripped.box.x).toBeCloseTo(primary.box.x, 6);
      expect(roundTripped.box.y).toBeCloseTo(primary.box.y, 6);
      expect(roundTripped.box.width).toBeCloseTo(primary.box.width, 6);
      expect(roundTripped.box.height).toBeCloseTo(primary.box.height, 6);
      expect(roundTripped.rotation).toBeCloseTo(primary.rotation, 6);
    });
  }
});
