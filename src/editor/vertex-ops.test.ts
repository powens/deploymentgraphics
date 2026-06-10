import { describe, it, expect } from "vitest";
import { insertVertexAtEdge, deleteVertex } from "./vertex-ops.js";
import type { Point } from "../building-coordinates.js";

describe("insertVertexAtEdge", () => {
  const square: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it("inserts midpoint between edge vertices", () => {
    const result = insertVertexAtEdge(square, 0);
    expect(result).toHaveLength(5);
    expect(result[1]).toEqual({ x: 5, y: 0 });
  });

  it("does not mutate original array", () => {
    insertVertexAtEdge(square, 0);
    expect(square).toHaveLength(4);
  });

  it("handles last edge (wraps to vertex 0)", () => {
    const result = insertVertexAtEdge(square, 3); // edge from {x:0,y:10} to {x:0,y:0}
    expect(result).toHaveLength(5);
    expect(result[4]).toEqual({ x: 0, y: 5 });
  });
});

describe("deleteVertex", () => {
  it("removes the vertex at the given index", () => {
    const quad: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const result = deleteVertex(quad, 1);
    expect(result).toHaveLength(3);
    expect(result).not.toContainEqual({ x: 10, y: 0 });
  });

  it("returns original array unchanged when length is 3", () => {
    const tri: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    const result = deleteVertex(tri, 0);
    expect(result).toBe(tri);
  });

  it("does not mutate original array", () => {
    const quad: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    deleteVertex(quad, 0);
    expect(quad).toHaveLength(4);
  });
});
