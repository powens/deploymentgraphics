import { describe, it, expect } from "vitest";
import {
  mirror,
  placeBuildings,
  placedFromPin,
  placedRing,
  placedTransform,
  resolveFeature,
  resolvePlacement,
  type Placed,
} from "./placement";
import type {
  PathTemplate,
  PolygonTemplate,
  Template,
} from "./building-coordinates";

const canvas = { width: 60, height: 44 };
const templates: Record<string, Template> = {
  "4x6": { width: 4, height: 6 },
  "6x12": { width: 6, height: 12 },
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

  it("places an axis-aligned building from a TL/TR corner pair", () => {
    const [primary] = resolvePlacement(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
      templates,
      canvas,
    );
    expect(primary).toEqual({
      name: "4x6",
      box: { x: 10, y: 5, width: 4, height: 6 },
      rotation: 0,
    });
  });

  it("resolves the two corners from different canvas anchors", () => {
    // [46,5,TR] -> (60-46, 5) = (14,5): same building as the axis-aligned case
    const [primary] = resolvePlacement(
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 46, y: 5, from: "TR" } } },
      templates,
      canvas,
    );
    expect(primary.box).toEqual({ x: 10, y: 5, width: 4, height: 6 });
    expect(primary.rotation).toBe(0);
  });

  it("offsets the box so the pinned corners land where authored (90 degrees)", () => {
    // 6x12 pinned TL->(20,10), TR->(20,16): a quarter turn. The unrotated box
    // sits at (11,7); rotating it 90deg about its centre (14,13) carries the
    // template's TL to the pinned (20,10).
    const [primary] = resolvePlacement(
      { type: "6x12", mirror: false, corners: { TL: { x: 20, y: 10 }, TR: { x: 20, y: 16 } } },
      templates,
      canvas,
    );
    expect(primary.box.x).toBeCloseTo(11);
    expect(primary.box.y).toBeCloseTo(7);
    expect(primary.box.width).toBe(6);
    expect(primary.box.height).toBe(12);
    expect(primary.rotation).toBeCloseTo(90);
  });

  it("places a building defined by a diagonal corner pair", () => {
    const [primary] = resolvePlacement(
      { type: "3x4", mirror: false, corners: { TL: { x: 10, y: 10 }, BR: { x: 13, y: 14 } } },
      templates,
      canvas,
    );
    expect(primary.box).toEqual({ x: 10, y: 10, width: 3, height: 4 });
    expect(primary.rotation).toBe(0);
  });

  it("places a diagonal corner pair with a non-zero rotation", () => {
    // 3x4 template (local diagonal TL->BR = (3,4)) rotated 90 degrees.
    // rotate((3,4), 90deg) = (-4,3), so BR sits at TL + (-4,3).
    const [primary] = resolvePlacement(
      { type: "3x4", mirror: false, corners: { TL: { x: 20, y: 10 }, BR: { x: 16, y: 13 } } },
      templates,
      canvas,
    );
    expect(primary.box.x).toBeCloseTo(16.5);
    expect(primary.box.y).toBeCloseTo(9.5);
    expect(primary.box.width).toBe(3);
    expect(primary.box.height).toBe(4);
    expect(primary.rotation).toBeCloseTo(90);
  });
});

describe("resolvePlacement (single corner)", () => {
  const pin = (corners: Parameters<typeof resolvePlacement>[0]["corners"]) =>
    resolvePlacement({ type: "4x6", mirror: false, corners }, templates, canvas)[0];

  it("pins a single TL corner with no rotation", () => {
    expect(pin({ TL: { x: 10, y: 5 } }).box).toEqual({ x: 10, y: 5, width: 4, height: 6 });
  });

  it("pins a single TR corner (box offset by the template width)", () => {
    // building TR corner -> canvas point (10,5); localCorner(TR)=(4,0)
    expect(pin({ TR: { x: 10, y: 5 } }).box).toEqual({ x: 6, y: 5, width: 4, height: 6 });
  });

  it("pins a single BL corner (box offset by the template height)", () => {
    // building BL corner -> canvas point (10,5); localCorner(BL)=(0,6)
    expect(pin({ BL: { x: 10, y: 5 } }).box).toEqual({ x: 10, y: -1, width: 4, height: 6 });
  });

  it("pins a single BR corner (offset by width and height)", () => {
    // building BR corner -> canvas point (10,5); localCorner(BR)=(4,6)
    expect(pin({ BR: { x: 10, y: 5 } }).box).toEqual({ x: 6, y: -1, width: 4, height: 6 });
  });

  it("honours the canvas anchor for a single corner", () => {
    // building TL corner -> (10,5) from canvas TR = (60-10, 5) = (50,5)
    expect(pin({ TL: { x: 10, y: 5, from: "TR" } }).box).toEqual({
      x: 50,
      y: 5,
      width: 4,
      height: 6,
    });
  });
});

describe("resolvePlacement validation", () => {
  it("throws on an unknown template", () => {
    expect(() =>
      resolvePlacement({ type: "ghost", corners: { TL: { x: 0, y: 0 } } }, templates, canvas),
    ).toThrow(/unknown template/);
  });

  it("throws when there are no corners", () => {
    expect(() =>
      resolvePlacement({ type: "4x6", corners: {} }, templates, canvas),
    ).toThrow(/1 or 2 corners/i);
  });

  it("throws when there are more than 2 corners", () => {
    expect(() =>
      resolvePlacement(
        { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 }, BR: { x: 14, y: 11 } } },
        templates,
        canvas,
      ),
    ).toThrow(/1 or 2 corners/i);
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

  it("accepts a corner distance within the 0.1\" tolerance", () => {
    expect(() =>
      resolvePlacement(
        { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 14.05, y: 5 } } },
        templates,
        canvas,
      ),
    ).not.toThrow();
  });
});

describe("resolvePlacement with a polygon template", () => {
  const polyTemplates: Record<string, PolygonTemplate> = {
    ruins: {
      points: [
        { x: 1, y: 0 },
        { x: 7, y: 2 },
        { x: 5, y: 11 },
        { x: 0, y: 6 },
      ],
    },
  };

  it("places a polygon by pinning its bounding-box corners", () => {
    // The polygon's bbox is 7x11, so TL->TR must span 7.
    const result = resolvePlacement(
      { type: "ruins", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 17, y: 5 } } },
      polyTemplates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "ruins",
      box: { x: 10, y: 5, width: 7, height: 11 },
      rotation: 0,
    });
  });

  it("throws when a corner span disagrees with the polygon bbox edge", () => {
    // TL->TR span is 6 but the polygon bbox's TL->TR edge is 7.
    expect(() =>
      resolvePlacement(
        { type: "ruins", corners: { TL: { x: 10, y: 5 }, TR: { x: 16, y: 5 } } },
        polyTemplates,
        canvas,
      ),
    ).toThrow(/template edge/i);
  });
});

describe("resolvePlacement with a path template", () => {
  const pathTemplates: Record<string, PathTemplate> = {
    bastion: {
      width: 8,
      height: 8,
      start: { x: 4, y: 0 },
      segments: [
        { cubic: { x: 8, y: 4 }, controls: [{ x: 6, y: 0 }, { x: 8, y: 2 }] },
        { cubic: { x: 4, y: 8 }, controls: [{ x: 8, y: 6 }, { x: 6, y: 8 }] },
        { cubic: { x: 0, y: 4 }, controls: [{ x: 2, y: 8 }, { x: 0, y: 6 }] },
        { cubic: { x: 4, y: 0 }, controls: [{ x: 0, y: 2 }, { x: 2, y: 0 }] },
      ],
    },
  };

  it("places a path template by pinning its declared bounding-box corners", () => {
    // The declared bbox is 8x8, so TL->TR must span 8.
    const result = resolvePlacement(
      { type: "bastion", mirror: false, corners: { TL: { x: 10, y: 5 }, TR: { x: 18, y: 5 } } },
      pathTemplates,
      canvas,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "bastion",
      box: { x: 10, y: 5, width: 8, height: 8 },
      rotation: 0,
    });
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

  it("mirrors when mirror is explicitly true", () => {
    expect(
      resolvePlacement(
        { type: "4x6", mirror: true, corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 } } },
        templates,
        canvas,
      ),
    ).toHaveLength(2);
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

describe("placedRing (drawing a local ring through a Placed)", () => {
  it("applies the same map placedTransform describes", () => {
    const placed: Placed = {
      name: "x",
      box: { x: 10, y: 8, width: 4, height: 2 },
      rotation: 90,
    };
    // A quarter turn about the box centre (2, 1) sends the local TL (0,0) to
    // (3, -1), then the translate puts it at (13, 7).
    const [tl] = placedRing([{ x: 0, y: 0 }], placed);
    expect(tl.x).toBeCloseTo(13, 12);
    expect(tl.y).toBeCloseTo(7, 12);
  });

  it("leaves the box centre where the box centre is", () => {
    const placed: Placed = {
      name: "x",
      box: { x: 10, y: 8, width: 4, height: 2 },
      rotation: 137,
    };
    const [c] = placedRing([{ x: 2, y: 1 }], placed);
    expect(c.x).toBeCloseTo(12, 12);
    expect(c.y).toBeCloseTo(9, 12);
  });
});

describe("placedFromPin (the last step of every converter fit)", () => {
  const size = { width: 6, height: 4 };

  it("is the inverse of placedRing for the pinned point", () => {
    // This is the property that lets a converter be checked at all: it fits a
    // placement so a known local point lands on a known absolute one, and the
    // check draws that local point back through the placement.
    const pin = { x: 0, y: 4 }; // an L-ruin's outer corner
    const at = { x: 21.5, y: 13.25 };
    for (const rotation of [0, 37, 90, 180, 271, -45]) {
      const placed = placedFromPin("l-ruin", size, rotation, pin, at);
      const [back] = placedRing([pin], placed);
      expect(back.x, `rotation ${rotation}`).toBeCloseTo(at.x, 10);
      expect(back.y, `rotation ${rotation}`).toBeCloseTo(at.y, 10);
    }
  });

  it("pinning the centre puts the box top-left at centre minus half the size", () => {
    // The degenerate case rect-to-feature.mjs uses: the rotation term drops
    // out, because the centre is the pivot.
    const centre = { x: size.width / 2, y: size.height / 2 };
    const placed = placedFromPin("generator", size, 47, centre, { x: 30, y: 22 });
    expect(placed.box.x).toBeCloseTo(27, 12);
    expect(placed.box.y).toBeCloseTo(20, 12);
  });

  it("normalises the rotation into [0, 360)", () => {
    const pin = { x: 0, y: 0 };
    const at = { x: 0, y: 0 };
    expect(placedFromPin("x", size, -90, pin, at).rotation).toBe(270);
    expect(placedFromPin("x", size, 450, pin, at).rotation).toBe(90);
  });

  it("carries the size through as the box", () => {
    const placed = placedFromPin("x", size, 0, { x: 0, y: 0 }, { x: 1, y: 2 });
    expect(placed.box.width).toBe(6);
    expect(placed.box.height).toBe(4);
    expect(placed.name).toBe("x");
  });
});
