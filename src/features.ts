import type { CanvasSize } from "./building-coordinates.js";
import { makeShape, type IconShape } from "./icons.js";
import type { SvgDocument, SvgNode } from "./svg-backend.js";
import { placedTransform, resolveFeature } from "./placement.js";
import type { FeaturePlacement } from "./terrain-config.js";
import type { Theme } from "./theme.js";

/** A feature's geometry, split by how it is painted (see `makeFeatures`). */
type FeatureArt = { body: IconShape[]; accent: IconShape[] };

/** Maps a bounding box (inches) to feature geometry in local 0..w / 0..h. */
export type FeatureDraw = (w: number, h: number) => FeatureArt;

// L-shaped ruin: walls down the left and along the bottom as one path, plus
// rubble dots.
const lRuin: FeatureDraw = (w, h) => {
  const wall = Math.min(0.5, w, h);
  const d = `M0 0 H${wall} V${h - wall} H${w} V${h} H0 Z`;
  const r = Math.max(0.15, wall * 0.4);
  return {
    body: [{ tag: "path", d }],
    accent: [
      { tag: "circle", cx: wall * 0.5, cy: h * 0.45, r },
      { tag: "circle", cx: w * 0.45, cy: h - wall * 0.5, r: r * 0.8 },
      { tag: "circle", cx: w * 0.72, cy: h - wall * 0.5, r: r * 0.6 },
    ],
  };
};

// Generator: body box, three vent slots, and a turbine disc whose radius is
// capped by both w and h so it stays round when the box is stretched.
const generator: FeatureDraw = (w, h) => {
  const ventW = Math.max(0.15, w * 0.04);
  const accent: IconShape[] = [];
  for (let i = 0; i < 3; i++) {
    accent.push({
      tag: "rect",
      x: w * 0.14 + i * (w * 0.09),
      y: h * 0.2,
      width: ventW,
      height: h * 0.6,
    });
  }
  const turbineR = Math.min(h * 0.32, w * 0.18);
  accent.push({ tag: "circle", cx: w - turbineR - w * 0.08, cy: h / 2, r: turbineR });
  return { body: [{ tag: "rect", x: 0, y: 0, width: w, height: h }], accent };
};

// `lRuin` reflected across x = w/2 (outer corner bottom-right). The
// opposite-chirality 40kdc ruins (balanced-right, corner-right) cannot be
// reached by rotating `lRuin`.
const lRuinMirror: FeatureDraw = (w, h) => {
  const wall = Math.min(0.5, w, h);
  const d = `M${w} 0 H${w - wall} V${h - wall} H0 V${h} H${w} Z`;
  const r = Math.max(0.15, wall * 0.4);
  return {
    body: [{ tag: "path", d }],
    accent: [
      { tag: "circle", cx: w - wall * 0.5, cy: h * 0.45, r },
      { tag: "circle", cx: w * 0.55, cy: h - wall * 0.5, r: r * 0.8 },
      { tag: "circle", cx: w * 0.28, cy: h - wall * 0.5, r: r * 0.6 },
    ],
  };
};

// Gantry: a deck (body) with an X cross-brace and four corner posts (accent),
// all sized from w/h.
const gantry: FeatureDraw = (w, h) => {
  const t = Math.min(0.3, w * 0.14, h * 0.14); // brace beam thickness
  // A thin quad beam between two corners, `t` wide, centred on the diagonal.
  const beam = (ax: number, ay: number, bx: number, by: number): string => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * (t / 2);
    const ny = (dx / len) * (t / 2);
    return (
      `M${ax + nx} ${ay + ny} L${bx + nx} ${by + ny} ` +
      `L${bx - nx} ${by - ny} L${ax - nx} ${ay - ny} Z`
    );
  };
  const r = Math.max(0.12, Math.min(w, h) * 0.13);
  const s = r * 1.4; // corner-post inset
  return {
    body: [{ tag: "rect", x: 0, y: 0, width: w, height: h }],
    accent: [
      { tag: "path", d: beam(0, 0, w, h) },
      { tag: "path", d: beam(w, 0, 0, h) },
      { tag: "circle", cx: s, cy: s, r },
      { tag: "circle", cx: w - s, cy: s, r },
      { tag: "circle", cx: w - s, cy: h - s, r },
      { tag: "circle", cx: s, cy: h - s, r },
    ],
  };
};

/** Feature draw registry, keyed by `FeaturePlacement.type`. */
export const features: Record<string, FeatureDraw> = {
  "l-ruin": lRuin,
  "l-ruin-mirror": lRuinMirror,
  generator,
  gantry,
};

/** Deterministic def id for a feature shape, keyed by type + bounding box. */
function featureDefId(
  type: string,
  width: number,
  height: number,
): string {
  const dim = (n: number): string => `${n}`.replace(".", "_");
  return `feature-${type}-${dim(width)}x${dim(height)}`;
}

/**
 * Appends one colour-free `<g id="feature-…">` per distinct (type, width,
 * height). Shapes are styled with `var(--body)`/`var(--accent)`, which each
 * `<use>` sets (see `makeFeatures`). Throws on an unknown feature type.
 */
export function injectFeatureDefs(
  doc: SvgDocument,
  placements: FeaturePlacement[],
  defs: SvgNode,
): void {
  const seen = new Set<string>();
  for (const placement of placements) {
    const id = featureDefId(placement.type, placement.width, placement.height);
    if (seen.has(id)) continue;
    seen.add(id);

    const draw = features[placement.type];
    if (!draw) throw new Error(`unknown feature type: ${placement.type}`);

    const { body, accent } = draw(placement.width, placement.height);
    const group = doc.createElement("g");
    group.setAttribute("id", id);
    for (const shape of body) {
      const el = makeShape(doc, shape);
      el.setAttribute("style", "fill:var(--body);stroke:var(--accent)");
      group.appendChild(el);
    }
    for (const shape of accent) {
      const el = makeShape(doc, shape);
      el.setAttribute("style", "fill:var(--accent)");
      group.appendChild(el);
    }
    defs.appendChild(group);
  }
}

/**
 * Builds `<g id="features">` with a `<use>` per resolved placement (mirror
 * copies included). Each `<use>` sets `--body`/`--accent` from the palette;
 * `stroke-width` is set once on the group. Throws on an unknown feature type or
 * palette colour.
 */
export function makeFeatures(
  doc: SvgDocument,
  placements: FeaturePlacement[],
  theme: Theme,
  canvas: CanvasSize,
): SvgNode {
  const group = doc.createElement("g");
  group.setAttribute("id", "features");
  group.setAttribute("stroke-width", `${theme.feature.stroke_width}`);
  let counter = 0;
  for (const placement of placements) {
    // Also checked in injectFeatureDefs; repeated for standalone callers.
    if (!features[placement.type]) {
      throw new Error(`unknown feature type: ${placement.type}`);
    }
    const palette = theme.feature.palette[placement.color];
    if (!palette) throw new Error(`unknown feature colour: ${placement.color}`);

    const href = `#${featureDefId(
      placement.type,
      placement.width,
      placement.height,
    )}`;
    for (const placed of resolveFeature(placement, canvas)) {
      const use = doc.createElement("use");
      use.setAttribute("href", href);
      use.setAttribute("transform", placedTransform(placed));
      use.setAttribute("id", `feature-${counter}`);
      use.setAttribute(
        "style",
        `--body:${palette.fill};--accent:${palette.accent}`,
      );
      group.appendChild(use);
      counter++;
    }
  }
  return group;
}
