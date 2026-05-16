export type Anchor = "TL" | "TR" | "BL" | "BR";
export type Point = [number, number];
export type CanvasSize = { width: number; height: number };

/** A corner: [x, y] or [x, y, from_anchor]. x/y are inward distances. */
export type CornerSpec = [number, number] | [number, number, Anchor];

/**
 * Resolves a corner spec to an absolute canvas point. x/y are measured
 * inward from the spec's anchor (its 3rd element, or `defaultFrom`).
 */
export function resolveCorner(
  spec: CornerSpec,
  defaultFrom: Anchor,
  canvas: CanvasSize,
): Point {
  const [x, y] = spec;
  const from: Anchor = spec.length === 3 ? spec[2] : defaultFrom;
  switch (from) {
    case "TL":
      return [x, y];
    case "TR":
      return [canvas.width - x, y];
    case "BL":
      return [x, canvas.height - y];
    case "BR":
      return [canvas.width - x, canvas.height - y];
  }
}
