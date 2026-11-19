import { describe, it, expect } from "vitest";
import {
  resolvePiece,
  resolvePieceIfAny,
  poseFromMatrix,
  poseMatrix,
} from "./terrain-resolver.mjs";
import {
  centroid,
  FLIP_X,
  FLIP_Y,
  IDENTITY,
  matmul,
  matvec,
  rotationMatrix,
} from "../src/geometry.ts";

const TRAPEZOID = {
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 2, y: 11.5 },
    { x: 0, y: 11.5 },
  ],
};

const near = (got, want) => {
  expect(got.length).toBe(want.length);
  got.forEach((p, i) => {
    expect(p.x).toBeCloseTo(want[i].x, 3);
    expect(p.y).toBeCloseTo(want[i].y, 3);
  });
};

describe("centroid", () => {
  it("is the area centroid of the trapezoid", () => {
    const c = centroid(TRAPEZOID.points);
    expect(c.x).toBeCloseTo(2.8, 3);
    expect(c.y).toBeCloseTo(4.6, 3);
  });
});

describe("resolvePiece", () => {
  it("identity-large: centres a rectangle on its position", () => {
    const piece = {
      footprint: { type: "rectangle", width: 11.5, height: 7 },
      position: { x: 30, y: 22 },
    };
    near(resolvePiece(piece, () => null).ring, [
      { x: 24.25, y: 18.5 },
      { x: 35.75, y: 18.5 },
      { x: 35.75, y: 25.5 },
      { x: 24.25, y: 25.5 },
    ]);
  });

  it("rotate-large-oblique-55", () => {
    const piece = {
      footprint: { type: "rectangle", width: 11.5, height: 7 },
      position: { x: 30, y: 22 },
      rotation_degrees: 55,
    };
    near(resolvePiece(piece, () => null).ring, [
      { x: 29.569, y: 15.2824 },
      { x: 36.1651, y: 24.7026 },
      { x: 30.431, y: 28.7176 },
      { x: 23.8349, y: 19.2974 },
    ]);
  });

  it("mirror-trapezoid-vertical-rot90 (mirror before rotate)", () => {
    const piece = {
      footprint: TRAPEZOID,
      position: { x: 40, y: 18 },
      rotation_degrees: 90,
      mirror: "vertical",
    };
    near(resolvePiece(piece, () => null).ring, [
      { x: 35.4, y: 15.2 },
      { x: 35.4, y: 23.2 },
      { x: 46.9, y: 17.2 },
      { x: 46.9, y: 15.2 },
    ]);
  });

  it("looks up a template footprint by id", () => {
    const piece = { template: "area-large", position: { x: 30, y: 22 } };
    const lookup = (id) =>
      id === "area-large" ? { type: "rectangle", width: 11.5, height: 7 } : null;
    near(resolvePiece(piece, lookup).ring, [
      { x: 24.25, y: 18.5 },
      { x: 35.75, y: 18.5 },
      { x: 35.75, y: 25.5 },
      { x: 24.25, y: 25.5 },
    ]);
  });

  it("throws on an unsupported footprint type", () => {
    const piece = {
      footprint: { type: "right-triangle", width: 8, height: 11.5 },
      position: { x: 0, y: 0 },
    };
    expect(() => resolvePiece(piece, () => null)).toThrow(/unsupported footprint/);
  });

  it("explicit-parent-feature: composes a child through its parent's transform", () => {
    const parent = {
      id: "a1",
      footprint: { type: "rectangle", width: 11.5, height: 7 },
      position: { x: 30, y: 22 },
      rotation_degrees: 90,
      mirror: "horizontal",
    };
    const child = {
      id: "back-wall",
      footprint: { type: "rectangle", width: 7, height: 0.25 },
      parent_area_id: "a1",
      position: { x: 0, y: -3 },
    };
    const getParent = (id) => (id === "a1" ? parent : undefined);
    near(resolvePiece(child, () => null, getParent).ring, [
      { x: 33.125, y: 25.5 },
      { x: 33.125, y: 18.5 },
      { x: 32.875, y: 18.5 },
      { x: 32.875, y: 25.5 },
    ]);
  });

  it("throws when a parented piece's parent is missing", () => {
    const child = {
      footprint: { type: "rectangle", width: 7, height: 0.25 },
      parent_area_id: "nope",
      position: { x: 0, y: 0 },
    };
    expect(() => resolvePiece(child, () => null, () => undefined)).toThrow(
      /missing parent/,
    );
  });
});

describe("footprint precedence", () => {
  const RECT = { type: "rectangle", width: 2, height: 3 };
  const TEMPLATE = { type: "rectangle", width: 5, height: 7 };
  const at = { position: { x: 0, y: 0 } };

  it("prefers the piece's own footprint over its template's", () => {
    const piece = { ...at, footprint: RECT, template: "t" };
    const { local } = resolvePiece(piece, () => TEMPLATE);
    expect(local[2]).toEqual({ x: 2, y: 3 });
  });

  it("falls back to the template's footprint", () => {
    const piece = { ...at, template: "t" };
    const { local } = resolvePiece(piece, () => TEMPLATE);
    expect(local[2]).toEqual({ x: 5, y: 7 });
  });

  // Rather than a bare TypeError from footprintPolygon(undefined).
  it("throws by name for a piece with neither", () => {
    expect(() =>
      resolvePiece({ ...at, id: "p7", template: "gone" }, () => undefined),
    ).toThrow(/piece p7 has no footprint or known template/);
  });

  it("is undefined from resolvePieceIfAny for a piece with neither", () => {
    expect(
      resolvePieceIfAny({ ...at, id: "p7", template: "gone" }, () => undefined),
    ).toBeUndefined();
  });

  it("applies the same precedence in resolvePieceIfAny", () => {
    const piece = { ...at, footprint: RECT, template: "t" };
    expect(resolvePieceIfAny(piece, () => TEMPLATE).local[2]).toEqual({
      x: 2,
      y: 3,
    });
  });
});

const nearMatrix = (got, want) => {
  got.forEach((row, i) =>
    row.forEach((x, j) => expect(x).toBeCloseTo(want[i][j], 9)),
  );
};

describe("poseMatrix", () => {
  it("is the identity for a piece with no pose", () => {
    expect(poseMatrix({})).toEqual(IDENTITY);
  });

  it("names each reflection by the axis it negates", () => {
    nearMatrix(poseMatrix({ mirror: "horizontal" }), FLIP_X);
    nearMatrix(poseMatrix({ mirror: "vertical" }), FLIP_Y);
  });

  it("reflects before it rotates", () => {
    const M = poseMatrix({ rotation_degrees: 90, mirror: "horizontal" });
    const p = matvec(M, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(-1, 9);
  });
});

describe("poseFromMatrix", () => {
  const maps = [0, 90, 180, 270, 37, 212.5].flatMap((d) => [
    [`R${d}`, rotationMatrix(d)],
    [`R${d}.FX`, matmul(rotationMatrix(d), FLIP_X)],
  ]);
  for (const [name, A] of maps) {
    it(`inverts poseMatrix for ${name}`, () => {
      nearMatrix(poseMatrix(poseFromMatrix(A)), A);
    });
  }

  it("gives back a quarter-turn without float noise", () => {
    expect(poseFromMatrix(rotationMatrix(90))).toEqual({ rotation_degrees: 90 });
    expect(poseFromMatrix(rotationMatrix(-1e-12))).toEqual({ rotation_degrees: 0 });
  });

  it("writes a vertical reflection as a horizontal one turned a half-turn", () => {
    expect(
      poseFromMatrix(poseMatrix({ rotation_degrees: 30, mirror: "vertical" })),
    ).toEqual({ rotation_degrees: 210, mirror: "horizontal" });
  });
});

describe("the resolved piece", () => {
  const piece = {
    footprint: TRAPEZOID,
    position: { x: 10, y: 20 },
    rotation_degrees: 55,
    mirror: "horizontal",
  };
  const parent = {
    id: "a1",
    footprint: { type: "rectangle", width: 11.5, height: 7 },
    position: { x: 30, y: 22 },
    rotation_degrees: 90,
    mirror: "horizontal",
  };
  const child = { ...piece, parent_area_id: "a1" };
  const getParent = (id) => (id === "a1" ? parent : undefined);

  it("carries the footprint ring in its own coordinates", () => {
    expect(resolvePiece(piece, () => null).local).toEqual(TRAPEZOID.points);
  });

  it("carries the piece's pose as its linear map", () => {
    expect(resolvePiece(piece, () => null).matrix).toEqual(poseMatrix(piece));
  });

  it("lands the footprint's area centroid on the piece's position", () => {
    const { place } = resolvePiece(piece, () => null);
    expect(place(centroid(TRAPEZOID.points))).toEqual({ x: 10, y: 20 });
  });

  it("places the local ring onto the board ring, vertex for vertex", () => {
    for (const p of [piece, child]) {
      const { local, ring, place } = resolvePiece(p, () => null, getParent);
      expect(local.map(place)).toEqual(ring);
    }
  });

  it("composes a child's map with its parent's", () => {
    const { matrix } = resolvePiece(child, () => null, getParent);
    nearMatrix(matrix, matmul(poseMatrix(parent), poseMatrix(child)));
  });

  it("puts a child's position where its parent's pose carries it", () => {
    const { place } = resolvePiece(child, () => null, getParent);
    const want = matvec(poseMatrix(parent), child.position);
    const got = place(centroid(TRAPEZOID.points));
    expect(got.x).toBeCloseTo(want.x + parent.position.x, 9);
    expect(got.y).toBeCloseTo(want.y + parent.position.y, 9);
  });
});
