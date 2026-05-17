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

/** Template-local position of a named rectangle corner. */
function localCorner(corner: Anchor, t: RectTemplate): Point {
  switch (corner) {
    case "TL":
      return [0, 0];
    case "TR":
      return [t.width, 0];
    case "BR":
      return [t.width, t.height];
    case "BL":
      return [0, t.height];
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
  templates: Record<string, RectTemplate>,
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
  const lA = localCorner(cornerA, template);
  const lB = localCorner(cornerB, template);

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
