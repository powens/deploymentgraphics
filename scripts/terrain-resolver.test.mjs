import { describe, it, expect } from "vitest";
import { resolvePiece, centroid } from "./terrain-resolver.mjs";

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
    near(resolvePiece(piece, () => null), [
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
    near(resolvePiece(piece, () => null), [
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
    near(resolvePiece(piece, () => null), [
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
    near(resolvePiece(piece, lookup), [
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
    near(resolvePiece(child, () => null, getParent), [
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
