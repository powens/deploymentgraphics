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

export type RectTemplate = { width: number; height: number };

/** A polygon footprint: a closed ring of template-local points. */
export type PolygonTemplate = { points: Point[] };

/** One segment of a path footprint: a line, quadratic, or cubic Bézier. */
export type PathSegment =
  | { line: Point }
  | { quad: Point; control: Point }
  | { cubic: Point; controls: [Point, Point] };

/**
 * A freeform curved footprint: a `start` point and an ordered list of
 * segments (the path auto-closes back to `start`). Its bounding box is
 * declared, not derived from the geometry.
 */
export type PathTemplate = {
  width: number;
  height: number;
  start: Point;
  segments: PathSegment[];
};

/** A building template — a rectangle, a polygon, or a curved path. */
export type Template = RectTemplate | PolygonTemplate | PathTemplate;

/**
 * The bounding-box size of a template. A rectangle and a path return their
 * stored/declared size; a polygon's size is derived from its points (the
 * bbox origin is required to be 0,0, so width/height are the maximum x/y).
 * Throws when a template is not a valid rectangle, polygon, or path.
 */
export function templateBounds(
  template: Template,
  name: string,
): { width: number; height: number } {
  if (
    "points" in template &&
    ("width" in template || "height" in template)
  ) {
    throw new Error(
      `template ${name}: defines both polygon points and width/height`,
    );
  }
  if ("segments" in template) {
    const { width, height, start, segments } = template;
    if (
      typeof width !== "number" ||
      width <= 0 ||
      typeof height !== "number" ||
      height <= 0
    ) {
      throw new Error(
        `template ${name}: path needs a positive width and height`,
      );
    }
    if (!start) {
      throw new Error(`template ${name}: path needs a start point`);
    }
    if (!Array.isArray(segments) || segments.length < 2) {
      throw new Error(`template ${name}: path needs at least 2 segments`);
    }
    return { width, height };
  }
  if ("points" in template) {
    const { points } = template;
    if (!Array.isArray(points) || points.length < 3) {
      throw new Error(`template ${name}: polygon needs at least 3 points`);
    }
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    if (minX !== 0 || minY !== 0) {
      throw new Error(
        `template ${name}: polygon bounding box must start at 0,0 ` +
          `(got ${minX},${minY})`,
      );
    }
    return { width: Math.max(...xs), height: Math.max(...ys) };
  }
  if ("width" in template && "height" in template) {
    return { width: template.width, height: template.height };
  }
  throw new Error(
    `template ${name}: must define width/height, polygon points, or ` +
      `path segments`,
  );
}

export type BuildingPlacement = {
  type: string;
  corners: Partial<Record<Anchor, CornerSpec>>; // exactly 2 entries
  from?: Anchor; // default anchor for 2-element corner specs; default "TL"
  mirror?: boolean; // default true
};

export type ResolvedBuilding = {
  templateName: string;
  translate: Point;
  rotation: number; // degrees, [0, 360)
};

/** Template-local position of a named bounding-box corner. */
function localCorner(
  corner: Anchor,
  size: { width: number; height: number },
): Point {
  switch (corner) {
    case "TL":
      return [0, 0];
    case "TR":
      return [size.width, 0];
    case "BR":
      return [size.width, size.height];
    case "BL":
      return [0, size.height];
  }
}

/** Rotates a point about the origin by `rad` radians. */
function rotate(p: Point, rad: number): Point {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
}

/**
 * Resolves a building placement to one or two ResolvedBuildings (the
 * primary placement, plus a 180-degree point-reflected copy unless
 * `mirror: false`). Throws on an unknown template, a corner count other
 * than 2, or a corner distance that disagrees with the template edge.
 */
export function resolveBuilding(
  placement: BuildingPlacement,
  templates: Record<string, Template>,
  canvas: CanvasSize,
): ResolvedBuilding[] {
  const template = templates[placement.type];
  if (!template) {
    throw new Error(
      `building references unknown template: ${placement.type}`,
    );
  }
  const entries = Object.entries(placement.corners) as [Anchor, CornerSpec][];
  if (entries.length !== 2) {
    throw new Error(
      `building ${placement.type}: expected exactly 2 corners, got ${entries.length}`,
    );
  }
  const defaultFrom: Anchor = placement.from ?? "TL";

  const [[cornerA, specA], [cornerB, specB]] = entries;
  const pA = resolveCorner(specA, defaultFrom, canvas);
  const pB = resolveCorner(specB, defaultFrom, canvas);
  const size = templateBounds(template, placement.type);
  const lA = localCorner(cornerA, size);
  const lB = localCorner(cornerB, size);

  const targetLength = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
  const templateLength = Math.hypot(lB[0] - lA[0], lB[1] - lA[1]);
  if (Math.abs(targetLength - templateLength) > 0.1) {
    throw new Error(
      `building ${placement.type}: corners ${cornerA}->${cornerB} measure ` +
        `${targetLength.toFixed(1)}" apart but template edge is ` +
        `${templateLength.toFixed(1)}"`,
    );
  }

  const theta =
    Math.atan2(pB[1] - pA[1], pB[0] - pA[0]) -
    Math.atan2(lB[1] - lA[1], lB[0] - lA[0]);
  const rotatedLA = rotate(lA, theta);
  const translate: Point = [pA[0] - rotatedLA[0], pA[1] - rotatedLA[1]];
  const rotation = (((theta * 180) / Math.PI) % 360 + 360) % 360;

  const primary: ResolvedBuilding = {
    templateName: placement.type,
    translate,
    rotation,
  };
  if (placement.mirror === false) {
    return [primary];
  }
  const mirrored: ResolvedBuilding = {
    templateName: placement.type,
    translate: [canvas.width - translate[0], canvas.height - translate[1]],
    rotation: (rotation + 180) % 360,
  };
  return [primary, mirrored];
}
