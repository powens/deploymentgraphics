import type { Point } from "../building-coordinates.js";

export function insertVertexAtEdge(
  vertices: Point[],
  edgeIndex: number,
): Point[] {
  const n = vertices.length;
  const a = vertices[edgeIndex];
  const b = vertices[(edgeIndex + 1) % n];
  const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const result = [...vertices];
  result.splice(edgeIndex + 1, 0, mid);
  return result;
}

export function deleteVertex(
  vertices: Point[],
  vi: number,
): Point[] {
  if (vertices.length <= 3) return vertices;
  return vertices.filter((_, i) => i !== vi);
}
