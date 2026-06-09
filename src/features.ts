import { makeElement } from "./dom-helpers.js";
import { makeShape, type IconShape } from "./icons.js";
import type { FeaturePlacement } from "./terrain-config.js";
import type { Theme } from "./theme.js";

/** A feature's geometry, split by how it is painted (see `makeFeatures`). */
export type FeatureArt = { body: IconShape[]; accent: IconShape[] };

/** Maps a bounding box (inches) to feature geometry in local 0..w / 0..h. */
export type FeatureDraw = (w: number, h: number) => FeatureArt;

// L-shaped ruin: thin walls — a vertical wall down the left and a horizontal
// wall along the bottom — drawn as a single path so the body reads as standing
// wall sections, plus a few rubble dots along the walls and inner corner.
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

// Sandbags: a tiling grid of ~1" bags as ellipses; the body stroke around
// each delineates the stack. A bigger box gets more bags.
const sandbags: FeatureDraw = (w, h) => {
  const cols = Math.max(1, Math.round(w));
  const rows = Math.max(1, Math.round(h));
  const cw = w / cols;
  const ch = h / rows;
  const body: IconShape[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      body.push({
        tag: "ellipse",
        cx: col * cw + cw / 2,
        cy: row * ch + ch / 2,
        rx: cw * 0.5,
        ry: ch * 0.5,
      });
    }
  }
  return { body, accent: [] };
};

// Generator: a body box, three vent slots on the left, and a turbine disc on
// the right held to a fixed-ish radius and vertically centered so it stays
// round when the box is stretched.
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

// Pipe: a capsule (rounded ends, radius = half height) with evenly spaced
// flange rings along its interior length. The radius is also capped at half
// the width so a pipe resized taller than it is wide stays a valid shape
// rather than producing negative path coordinates.
const pipe: FeatureDraw = (w, h) => {
  const r = Math.min(h / 2, w / 2);
  const d =
    `M${r} 0 L${w - r} 0 A${r} ${r} 0 0 1 ${w - r} ${h} ` +
    `L${r} ${h} A${r} ${r} 0 0 1 ${r} 0 Z`;
  const ringW = Math.max(0.15, h * 0.18);
  const start = Math.min(h, w * 0.2);
  const end = w - start;
  const accent: IconShape[] = [];
  const rings = Math.max(2, Math.round(w / (h * 2)));
  for (let i = 0; i < rings; i++) {
    const x =
      end <= start ? w / 2 : start + ((end - start) * i) / (rings - 1);
    accent.push({ tag: "rect", x: x - ringW / 2, y: 0, width: ringW, height: h });
  }
  return { body: [{ tag: "path", d }], accent };
};

/** Feature draw registry, keyed by `FeaturePlacement.type`. */
export const features: Record<string, FeatureDraw> = {
  "l-ruin": lRuin,
  sandbags,
  generator,
  pipe,
};

/**
 * Builds `<g id="features">`, one inner `<g>` per placement (translated to its
 * position and rotated about its box center). Body shapes take the palette fill
 * plus a thin accent-coloured outline; accent shapes take the accent fill and
 * draw on top. Throws on an unknown feature type or palette colour.
 */
export function makeFeatures(
  placements: FeaturePlacement[],
  theme: Theme,
): SVGElement {
  const group = makeElement("g");
  group.setAttribute("id", "features");
  let counter = 0;
  for (const placement of placements) {
    const draw = features[placement.type];
    if (!draw) throw new Error(`unknown feature type: ${placement.type}`);
    const palette = theme.feature.palette[placement.color];
    if (!palette) throw new Error(`unknown feature colour: ${placement.color}`);

    const { body, accent } = draw(placement.width, placement.height);
    const g = makeElement("g");
    const rotation = placement.rotation ?? 0;
    g.setAttribute(
      "transform",
      `translate(${placement.x} ${placement.y}) ` +
        `rotate(${rotation} ${placement.width / 2} ${placement.height / 2})`,
    );
    g.setAttribute("id", `feature-${counter}`);

    for (const shape of body) {
      const el = makeShape(shape);
      el.setAttribute("fill", palette.fill);
      el.setAttribute("stroke", palette.accent);
      el.setAttribute("stroke-width", `${theme.feature.stroke_width}`);
      g.appendChild(el);
    }
    for (const shape of accent) {
      const el = makeShape(shape);
      el.setAttribute("fill", palette.accent);
      g.appendChild(el);
    }

    group.appendChild(g);
    counter++;
  }
  return group;
}
