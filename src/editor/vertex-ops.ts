export function insertVertexAtEdge(
  vertices: [number, number][],
  edgeIndex: number,
): [number, number][] {
  const n = vertices.length;
  const [ax, ay] = vertices[edgeIndex];
  const [bx, by] = vertices[(edgeIndex + 1) % n];
  const mid: [number, number] = [(ax + bx) / 2, (ay + by) / 2];
  const result = [...vertices];
  result.splice(edgeIndex + 1, 0, mid);
  return result;
}

export function deleteVertex(
  vertices: [number, number][],
  vi: number,
): [number, number][] {
  if (vertices.length <= 3) return vertices;
  return vertices.filter((_, i) => i !== vi);
}
