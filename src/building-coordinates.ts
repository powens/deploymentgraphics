// `.ts` specifier: the 40kdc converters load this module under plain Node.
// See the tsconfig note on rewriteRelativeImportExtensions.
//
// Building templates and their corner-pin placement shape, and the owner of
// the Template box (`templateBounds`). Resolving a placement is placement.ts's.
import { bounds, type Point } from "./geometry.ts";

export type Anchor = "TL" | "TR" | "BL" | "BR";
export type CanvasSize = { width: number; height: number };

export type { Point };

/** A corner: { x, y } with an optional `from` anchor override. x/y are inward distances. */
export type CornerSpec = { x: number; y: number; from?: Anchor };

export type RectTemplate = { width: number; height: number };

/**
 * A polygon footprint in template-local points. The placement box is derived
 * from the points (which must start at 0,0) unless `width`/`height` declare
 * it, in which case the geometry may protrude past it.
 */
export type PolygonTemplate = { points: Point[]; width?: number; height?: number };

/** A building template — a rectangle or a polygon. */
export type Template = RectTemplate | PolygonTemplate;

/**
 * The template box: a rectangle's size, or a polygon's declared size, else its
 * points' max x/y (bbox must start at 0,0). Throws on an invalid template.
 */
export function templateBounds(
  template: Template,
  name: string,
): { width: number; height: number } {
  if ("points" in template) {
    const { points } = template;
    if (!Array.isArray(points) || points.length < 3) {
      throw new Error(`template ${name}: polygon needs at least 3 points`);
    }
    if ("width" in template || "height" in template) {
      const { width, height } = template;
      if (
        typeof width !== "number" ||
        width <= 0 ||
        typeof height !== "number" ||
        height <= 0
      ) {
        throw new Error(
          `template ${name}: polygon with a declared bounding box needs a ` +
            `positive width and height`,
        );
      }
      return { width, height };
    }
    const { minX, minY, maxX, maxY } = bounds(points);
    if (minX !== 0 || minY !== 0) {
      throw new Error(
        `template ${name}: polygon bounding box must start at 0,0 ` +
          `(got ${minX},${minY})`,
      );
    }
    return { width: maxX, height: maxY };
  }
  if ("width" in template && "height" in template) {
    return { width: template.width, height: template.height };
  }
  throw new Error(
    `template ${name}: must define width/height or polygon points`,
  );
}

export type BuildingPlacement = {
  type: string;
  corners: Partial<Record<Anchor, CornerSpec>>; // 1 or 2 entries
  from?: Anchor; // default anchor for corner specs; default "TL"
  mirror?: boolean; // default true
};
