import { describe, it, expect } from "vitest";
import { insertVertexAtEdge, deleteVertex } from "./vertex-ops.js";

describe("insertVertexAtEdge", () => {
  const square: [number, number][] = [[0,0],[10,0],[10,10],[0,10]];

  it("inserts midpoint between edge vertices", () => {
    const result = insertVertexAtEdge(square, 0);
    expect(result).toHaveLength(5);
    expect(result[1]).toEqual([5, 0]);
  });

  it("does not mutate original array", () => {
    insertVertexAtEdge(square, 0);
    expect(square).toHaveLength(4);
  });

  it("handles last edge (wraps to vertex 0)", () => {
    const result = insertVertexAtEdge(square, 3); // edge from [0,10] to [0,0]
    expect(result).toHaveLength(5);
    expect(result[4]).toEqual([0, 5]);
  });
});

describe("deleteVertex", () => {
  it("removes the vertex at the given index", () => {
    const quad: [number, number][] = [[0,0],[10,0],[10,10],[0,10]];
    const result = deleteVertex(quad, 1);
    expect(result).toHaveLength(3);
    expect(result).not.toContainEqual([10, 0]);
  });

  it("returns original array unchanged when length is 3", () => {
    const tri: [number, number][] = [[0,0],[10,0],[5,10]];
    const result = deleteVertex(tri, 0);
    expect(result).toBe(tri);
  });

  it("does not mutate original array", () => {
    const quad: [number, number][] = [[0,0],[10,0],[10,10],[0,10]];
    deleteVertex(quad, 0);
    expect(quad).toHaveLength(4);
  });
});
