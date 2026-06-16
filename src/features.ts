import type { CanvasSize } from "./building-coordinates.js";
import { makeElement } from "./dom-helpers.js";
import { makeShape, type IconShape } from "./icons.js";
import { resolveFeature } from "./placement.js";
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

// Pipe: a thin capsule tube running down the centre of the box (rounded ends,
// radius = half the tube thickness) sitting on a few small linear supports —
// short struts that cross the tube and extend off both sides to the box edges,
// like trestle legs. The radius is capped at half the width so a pipe resized
// taller than it is wide stays a valid shape rather than producing negative
// path coordinates.
const pipe: FeatureDraw = (w, h) => {
  const tube = h * 0.46; // thin pipe band, vertically centred
  const top = (h - tube) / 2;
  const bot = top + tube;
  const r = Math.min(tube / 2, w / 2);
  const d =
    `M${r} ${top} L${w - r} ${top} A${r} ${r} 0 0 1 ${w - r} ${bot} ` +
    `L${r} ${bot} A${r} ${r} 0 0 1 ${r} ${top} Z`;
  const supportW = Math.max(0.15, tube * 0.4);
  const start = Math.min(w * 0.2, w / 2);
  const end = w - start;
  const supports = Math.max(2, Math.min(5, Math.round(w / 2)));
  const accent: IconShape[] = [];
  for (let i = 0; i < supports; i++) {
    const cx = start + ((end - start) * i) / (supports - 1);
    const x = Math.min(Math.max(cx, supportW / 2), w - supportW / 2);
    accent.push({ tag: "rect", x: x - supportW / 2, y: 0, width: supportW, height: h });
  }
  return { body: [{ tag: "path", d }], accent };
};

// L-ruin with a corner roof: the same two l-ruin walls (left + bottom, rubble
// and all) plus a right-triangular floor/ceiling slab tucked into the inner
// corner where they meet. The roof's right angle sits at the walls' inner
// corner (so it rests against their inner faces rather than overlapping them);
// its legs run two-thirds up and along the open span, and an accent beam hugs
// the hypotenuse so the slab reads as a raised platform edge.
const lRuinRoof: FeatureDraw = (w, h) => {
  const base = lRuin(w, h);
  const wall = Math.min(0.5, w, h);
  const cx = wall; // inner corner x (right of the left wall)
  const cy = h - wall; // inner corner y (top of the bottom wall)
  const lw = ((w - wall) * 2) / 3;
  const lh = ((h - wall) * 2) / 3;
  const roof = `M${cx} ${cy - lh} V${cy} H${cx + lw} Z`;
  const t = Math.min(0.4, lw * 0.3, lh * 0.3);
  const beam =
    `M${cx} ${cy - lh} L${cx + lw} ${cy} ` +
    `L${cx + lw - t} ${cy} L${cx} ${cy - lh + t} Z`;
  return {
    body: [...base.body, { tag: "path", d: roof }],
    accent: [...base.accent, { tag: "path", d: beam }],
  };
};

// Horizontal mirror of `lRuin` (reflected across x = w/2): the outer corner
// sits bottom-right with walls along the right and bottom edges. Needed for the
// opposite-chirality 40kdc corner ruins (balanced-right, corner-right), which a
// rotation of `lRuin` alone can never reproduce — the same reason `shoe` has a
// `shoe-mirror` building template.
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

// Horizontal mirror of `lRuinRoof`: the same right+bottom walls as
// `lRuinMirror` plus the roof slab tucked into the bottom-right inner corner.
const lRuinRoofMirror: FeatureDraw = (w, h) => {
  const base = lRuinMirror(w, h);
  const wall = Math.min(0.5, w, h);
  const cx = w - wall; // inner corner x (left of the right wall)
  const cy = h - wall; // inner corner y (top of the bottom wall)
  const lw = ((w - wall) * 2) / 3;
  const lh = ((h - wall) * 2) / 3;
  const roof = `M${cx} ${cy - lh} V${cy} H${cx - lw} Z`;
  const t = Math.min(0.4, lw * 0.3, lh * 0.3);
  const beam =
    `M${cx} ${cy - lh} L${cx - lw} ${cy} ` +
    `L${cx - lw + t} ${cy} L${cx} ${cy - lh + t} Z`;
  return {
    body: [...base.body, { tag: "path", d: roof }],
    accent: [...base.accent, { tag: "path", d: beam }],
  };
};

// Gantry: a square deck (body) with an X cross-brace and four corner posts on
// top (accent), reading as a braced raised platform. The two brace beams are
// thin quads along the deck's diagonals; their thickness and the post radius
// derive from w/h so the structure scales with the box.
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
  "l-ruin-roof": lRuinRoof,
  "l-ruin-roof-mirror": lRuinRoofMirror,
  generator,
  gantry,
  pipe,
};

/**
 * Builds `<g id="features">`, one inner `<g>` per placement (translated to its
 * position and rotated about its box center). Body shapes take the palette fill
 * plus a thin accent-coloured outline; accent shapes take the accent fill and
 * draw on top. Like buildings, each placement also emits a copy point-reflected
 * through the canvas centre unless `mirror: false`. Throws on an unknown feature
 * type or palette colour.
 */
export function makeFeatures(
  placements: FeaturePlacement[],
  theme: Theme,
  canvas: CanvasSize,
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

    for (const placed of resolveFeature(placement, canvas)) {
      const g = makeElement("g");
      g.setAttribute(
        "transform",
        `translate(${placed.box.x} ${placed.box.y}) ` +
          `rotate(${placed.rotation} ${placed.box.width / 2} ${placed.box.height / 2})`,
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
  }
  return group;
}
