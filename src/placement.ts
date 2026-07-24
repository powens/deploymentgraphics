import {
  localCorner,
  resolveCorner,
  rotate,
  templateBounds,
  type Anchor,
  type BuildingPlacement,
  type CanvasSize,
  type CornerSpec,
  type Point,
  type Template,
} from "./building-coordinates.js";
import type { FeaturePlacement } from "./terrain-config.js";

/** An axis-aligned box in canvas inches; (x,y) is the unrotated top-left. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * The canonical resolved form of any board piece: an unrotated bounding box
 * plus a rotation taken about the box centre. Every authoring placement
 * (corner-pin buildings, box features) resolves to a `Placed`, and every
 * renderer draws it with the same `translate(box.x box.y) rotate(rotation
 * cx cy)`. This is the single representation behind the placement seam.
 */
export type Placed = {
  name: string;
  box: Box;
  rotation: number; // degrees, [0, 360)
};

/**
 * The transform that draws a `Placed`: translate to the box top-left, then
 * rotate about the box centre `(width/2, height/2)`. The single owner of the
 * centre-pivot convention — every renderer of a `Placed` (buildings, features)
 * crosses this seam instead of re-spelling the pivot. Note: `ResolvedBuilding`
 * below rotates about the *top-left* (origin-pivot), a different convention,
 * and must NOT use this.
 */
export function placedTransform(placed: Placed): string {
  return (
    `translate(${placed.box.x} ${placed.box.y}) ` +
    `rotate(${placed.rotation} ${placed.box.width / 2} ${placed.box.height / 2})`
  );
}

/**
 * Point-reflects a `Placed` through the canvas centre (rotation += 180). The
 * one mirror formula shared by buildings and features — point reflection is a
 * rotation by 180 about the centre, so the box's top-left maps to its
 * opposite and the orientation gains a half-turn.
 */
export function mirror(placed: Placed, canvas: CanvasSize): Placed {
  return {
    name: placed.name,
    box: {
      x: canvas.width - placed.box.x - placed.box.width,
      y: canvas.height - placed.box.y - placed.box.height,
      width: placed.box.width,
      height: placed.box.height,
    },
    rotation: (placed.rotation + 180) % 360,
  };
}

/**
 * Applies the mirror default — on unless `mirror: false` — yielding the
 * primary plus an optional point-reflected copy. The single owner of the
 * "mirror unless explicitly false" rule.
 */
function withMirror(
  primary: Placed,
  mirrorFlag: boolean | undefined,
  canvas: CanvasSize,
): Placed[] {
  return mirrorFlag === false ? [primary] : [primary, mirror(primary, canvas)];
}

/**
 * Resolves a corner-pin building placement to its primary `Placed` (no
 * mirror). One corner pins position with no rotation; a second corner derives
 * the rotation (checked against the template edge). The corner trigonometry
 * yields an origin-pivot landing point, which is converted to a centre-pivot
 * box so every `Placed` shares one pivot convention.
 */
function resolvePrimary(
  placement: BuildingPlacement,
  templates: Record<string, Template>,
  canvas: CanvasSize,
): Placed {
  const template = templates[placement.type];
  if (!template) {
    throw new Error(`building references unknown template: ${placement.type}`);
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
  // Origin-pivot landing of the template origin, then converted to a
  // centre-pivot box: box = translate + (Rot(theta)·c - c).
  const translate: Point = { x: pA.x - rotatedLA.x, y: pA.y - rotatedLA.y };
  const rotation = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
  const c: Point = { x: size.width / 2, y: size.height / 2 };
  const rc = rotate(c, theta);
  return {
    name: placement.type,
    box: {
      x: translate.x + rc.x - c.x,
      y: translate.y + rc.y - c.y,
      width: size.width,
      height: size.height,
    },
    rotation,
  };
}

/**
 * Resolves a corner-pin building placement to one or two `Placed` (primary,
 * plus a point-reflected copy unless `mirror: false`). Throws on an unknown
 * template, a corner count other than 1–2, or a corner distance that
 * disagrees with the template edge.
 */
export function resolvePlacement(
  placement: BuildingPlacement,
  templates: Record<string, Template>,
  canvas: CanvasSize,
): Placed[] {
  return withMirror(
    resolvePrimary(placement, templates, canvas),
    placement.mirror,
    canvas,
  );
}

/** Flattens a layout's building placements to mirror-expanded `Placed`. */
export function placeBuildings(
  placements: BuildingPlacement[],
  templates: Record<string, Template>,
  canvas: CanvasSize,
): Placed[] {
  return placements.flatMap((p) => resolvePlacement(p, templates, canvas));
}

/**
 * Resolves a box-authored feature placement to one or two `Placed` (primary
 * plus point-reflected copy unless `mirror: false`). Features already carry a
 * box and a centre rotation, so the primary is the placement verbatim.
 */
export function resolveFeature(
  feature: FeaturePlacement,
  canvas: CanvasSize,
): Placed[] {
  const primary: Placed = {
    name: feature.type,
    box: { x: feature.x, y: feature.y, width: feature.width, height: feature.height },
    rotation: feature.rotation ?? 0,
  };
  return withMirror(primary, feature.mirror, canvas);
}

/**
 * Origin-pivot resolved building: an unrotated top-left `translate` plus a
 * rotation taken *about that top-left*, rather than about the box centre.
 */
export type ResolvedBuilding = {
  templateName: string;
  translate: Point;
  rotation: number; // degrees, [0, 360)
};

/** Converts a centre-pivot `Placed` to its origin-pivot form. */
function placedToOrigin(placed: Placed): ResolvedBuilding {
  const c: Point = { x: placed.box.width / 2, y: placed.box.height / 2 };
  const rc = rotate(c, (placed.rotation * Math.PI) / 180);
  return {
    templateName: placed.name,
    translate: { x: placed.box.x + c.x - rc.x, y: placed.box.y + c.y - rc.y },
    rotation: placed.rotation,
  };
}

/**
 * Resolves a building to origin-pivot `ResolvedBuilding`s (template origin
 * lands at `translate`, rotation about that origin). A thin adapter over the
 * centre-pivot `resolvePlacement` so the corner math has one home.
 */
export function resolveBuilding(
  placement: BuildingPlacement,
  templates: Record<string, Template>,
  canvas: CanvasSize,
): ResolvedBuilding[] {
  return resolvePlacement(placement, templates, canvas).map(placedToOrigin);
}
