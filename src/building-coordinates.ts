export type Anchor = "TL" | "TR" | "BL" | "BR";
export type Point = { x: number; y: number };
export type CanvasSize = { width: number; height: number };

/** A corner: { x, y } with an optional `from` anchor override. x/y are inward distances. */
export type CornerSpec = { x: number; y: number; from?: Anchor };

/** Validates an untyped value as a Point, throwing with `context` on failure. */
export function toPoint(value: unknown, context: string): Point {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as Point).x !== "number" ||
    typeof (value as Point).y !== "number"
  ) {
    throw new Error(
      `${context}: expected { x, y }, got ${JSON.stringify(value)}`,
    );
  }
  return value as Point;
}

/**
 * Resolves a corner spec to an absolute canvas point. x/y are measured
 * inward from the spec's anchor (its `from` field, or `defaultFrom`).
 */
export function resolveCorner(
  spec: CornerSpec,
  defaultFrom: Anchor,
  canvas: CanvasSize,
): Point {
  const { x, y } = toPoint(spec, "building corner");
  const from: Anchor = spec.from ?? defaultFrom;
  switch (from) {
    case "TL":
      return { x, y };
    case "TR":
      return { x: canvas.width - x, y };
    case "BL":
      return { x, y: canvas.height - y };
    case "BR":
      return { x: canvas.width - x, y: canvas.height - y };
  }
}

export type RectTemplate = { width: number; height: number };

/**
 * A polygon footprint: a closed ring of template-local points. The bounding
 * box (used for placement) is normally derived from the points and must start
 * at 0,0. An optional declared `width`/`height` overrides that derivation, so
 * the geometry may extend beyond the box — e.g. small nubbins that poke past
 * the body's edge while the body fills the declared box.
 */
export type PolygonTemplate = { points: Point[]; width?: number; height?: number };

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
    toPoint(start, `template ${name}: path start`);
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
    // A declared width/height is the placement box; the geometry may then
    // extend past it (protruding nubbins). Without one, the box is derived
    // from the points and is required to start at 0,0.
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
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
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
  corners: Partial<Record<Anchor, CornerSpec>>; // 1 or 2 entries
  from?: Anchor; // default anchor for corner specs; default "TL"
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
      return { x: 0, y: 0 };
    case "TR":
      return { x: size.width, y: 0 };
    case "BR":
      return { x: size.width, y: size.height };
    case "BL":
      return { x: 0, y: size.height };
  }
}

/** Rotates a point about the origin by `rad` radians. */
function rotate(p: Point, rad: number): Point {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
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
  if (entries.length < 1 || entries.length > 2) {
    throw new Error(
      `building ${placement.type}: expected 1 or 2 corners, got ${entries.length}`,
    );
  }
  const defaultFrom: Anchor = placement.from ?? "TL";
  const size = templateBounds(template, placement.type);

  const [[cornerA, specA]] = entries;
  const pA = resolveCorner(specA, defaultFrom, canvas);
  const lA = localCorner(cornerA, size);

  // A single corner pins position with no rotation; a second corner derives
  // the rotation (and is checked against the template's edge length).
  let theta = 0;
  if (entries.length === 2) {
    const [, [cornerB, specB]] = entries;
    const pB = resolveCorner(specB, defaultFrom, canvas);
    const lB = localCorner(cornerB, size);

    const targetLength = Math.hypot(pB.x - pA.x, pB.y - pA.y);
    const templateLength = Math.hypot(lB.x - lA.x, lB.y - lA.y);
    if (Math.abs(targetLength - templateLength) > 0.1) {
      throw new Error(
        `building ${placement.type}: corners ${cornerA}->${cornerB} measure ` +
          `${targetLength.toFixed(1)}" apart but template edge is ` +
          `${templateLength.toFixed(1)}"`,
      );
    }

    theta =
      Math.atan2(pB.y - pA.y, pB.x - pA.x) -
      Math.atan2(lB.y - lA.y, lB.x - lA.x);
  }
  const rotatedLA = rotate(lA, theta);
  const translate: Point = { x: pA.x - rotatedLA.x, y: pA.y - rotatedLA.y };
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
    translate: { x: canvas.width - translate.x, y: canvas.height - translate.y },
    rotation: (rotation + 180) % 360,
  };
  return [primary, mirrored];
}
