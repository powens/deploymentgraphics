// `.ts` specifiers: the 40kdc converters load this module under plain Node,
// which resolves specifiers literally. See the tsconfig note.
import {
  localCorner,
  resolveCorner,
  templateBounds,
  type Anchor,
  type BuildingPlacement,
  type CanvasSize,
  type CornerSpec,
  type Template,
} from "./building-coordinates.ts";
import {
  distance,
  normalizeDegrees,
  rotate,
  toDegrees,
  toRadians,
  type Point,
  type Ring,
} from "./geometry.ts";
import type { FeaturePlacement } from "./terrain-config.ts";

/** An axis-aligned box in canvas inches; (x,y) is the unrotated top-left. */
type Box = { x: number; y: number; width: number; height: number };

/**
 * The resolved form of any board piece: an unrotated box plus a rotation about
 * the box centre. Both corner-pin buildings and box features resolve to this.
 */
export type Placed = {
  name: string;
  box: Box;
  rotation: number; // degrees, [0, 360)
};

/**
 * SVG transform for a `Placed`: translate to the box top-left, then rotate
 * about the box centre. Renderers use this rather than re-spelling the pivot.
 */
export function placedTransform(placed: Placed): string {
  return (
    `translate(${placed.box.x} ${placed.box.y}) ` +
    `rotate(${placed.rotation} ${placed.box.width / 2} ${placed.box.height / 2})`
  );
}

/**
 * Maps a template-local ring through a `Placed`: the same transform as
 * `placedTransform`, in JavaScript. Converter tests use it to check a fit
 * without re-deriving the pivot (and repeating any pivot bug).
 */
export function placedRing(ring: Ring, placed: Placed): Ring {
  const rad = toRadians(placed.rotation);
  const cx = placed.box.width / 2;
  const cy = placed.box.height / 2;
  return ring.map((p) => {
    const r = rotate({ x: p.x - cx, y: p.y - cy }, rad);
    return { x: placed.box.x + cx + r.x, y: placed.box.y + cy + r.y };
  });
}

/**
 * The `Placed` that lands template-local point `pin` on absolute point `at`,
 * with the box turned `rotation` degrees about its centre. Inverse of
 * `placedRing` for the pinned point: `placedRing([pin], p)` is `[at]`.
 * Used by the converters that emit a `Placed` directly (`ruin-to-feature`,
 * `rect-to-feature`; the latter pins the centre).
 */
export function placedFromPin(
  name: string,
  size: { width: number; height: number },
  rotation: number,
  pin: Point,
  at: Point,
): Placed {
  const c: Point = { x: size.width / 2, y: size.height / 2 };
  const offset = rotate({ x: pin.x - c.x, y: pin.y - c.y }, toRadians(rotation));
  return {
    name,
    box: {
      x: at.x - offset.x - c.x,
      y: at.y - offset.y - c.y,
      width: size.width,
      height: size.height,
    },
    rotation: normalizeDegrees(rotation),
  };
}

/** Point-reflects a `Placed` through the canvas centre (rotation += 180). */
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

/** Primary plus its mirrored copy, unless `mirror` is explicitly false. */
function withMirror(
  primary: Placed,
  mirrorFlag: boolean | undefined,
  canvas: CanvasSize,
): Placed[] {
  return mirrorFlag === false ? [primary] : [primary, mirror(primary, canvas)];
}

/**
 * Resolves a corner-pin placement to its primary `Placed` (no mirror). One
 * corner fixes position at rotation 0; a second derives the rotation and must
 * match the template edge length.
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

    const targetLength = distance(pA, pB);
    const templateLength = distance(lA, lB);
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
  const rotation = normalizeDegrees(toDegrees(theta));
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
 * Resolves a corner-pin building placement to its primary plus mirrored copy
 * (unless `mirror: false`). Throws on an unknown template, a corner count
 * other than 1–2, or a corner distance that disagrees with the template edge.
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
 * Resolves a feature placement to its primary plus mirrored copy (unless
 * `mirror: false`). Features are already box + centre rotation, so the
 * primary is the placement verbatim.
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
