import type { CanvasSize } from "./building-coordinates.js";
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

// A rounded-rect ("bag") path, top-left (x,y) with size wd×ht and soft corners.
function bagPath(x: number, y: number, wd: number, ht: number): string {
  const rr = Math.min(wd, ht) * 0.4;
  return (
    `M${x + rr} ${y} H${x + wd - rr} A${rr} ${rr} 0 0 1 ${x + wd} ${y + rr} ` +
    `V${y + ht - rr} A${rr} ${rr} 0 0 1 ${x + wd - rr} ${y + ht} ` +
    `H${x + rr} A${rr} ${rr} 0 0 1 ${x} ${y + ht - rr} ` +
    `V${y + rr} A${rr} ${rr} 0 0 1 ${x + rr} ${y} Z`
  );
}

// Sandbags: a low barrier wall of ~1" bags laid in 2–3 courses that run along
// the box's long axis. Each course fills the full length edge-to-edge, and
// alternate courses carry one extra bag so their seams fall mid-bag against the
// neighbour for a brick-bond weave. Bags overlap slightly and each takes the
// body stroke, so the stack reads as packed sandbags rather than a uniform
// grid. A bigger box gets more bags.
const sandbags: FeatureDraw = (w, h) => {
  const horizontal = w >= h;
  const len = horizontal ? w : h; // along the wall
  const thick = horizontal ? h : w; // across the wall
  const courses = Math.max(2, Math.min(3, Math.round(thick)));
  const n = Math.max(2, Math.round(len)); // base bags per course
  const cv = thick / courses; // course depth across the wall
  const bagV = cv * 1.12; // slight overlap across courses
  const body: IconShape[] = [];
  for (let c = 0; c < courses; c++) {
    const count = n + (c % 2); // alternate +1 bag to stagger the seams
    const pitch = len / count; // bag spacing along this course
    const bagU = pitch * 1.06; // slight overlap along the wall
    const vCenter = (c + 0.5) * cv;
    for (let i = 0; i < count; i++) {
      const uCenter = (i + 0.5) * pitch;
      // Map oriented (along, across) back to box (x, y); swap for a vertical wall.
      const x = horizontal ? uCenter - bagU / 2 : vCenter - bagV / 2;
      const y = horizontal ? vCenter - bagV / 2 : uCenter - bagU / 2;
      const wd = horizontal ? bagU : bagV;
      const ht = horizontal ? bagV : bagU;
      body.push({ tag: "path", d: bagPath(x, y, wd, ht) });
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

/** Feature draw registry, keyed by `FeaturePlacement.type`. */
export const features: Record<string, FeatureDraw> = {
  "l-ruin": lRuin,
  sandbags,
  generator,
  pipe,
};

/** Point-reflects a placement through the canvas centre (rotation += 180). */
function mirrorPlacement(
  placement: FeaturePlacement,
  canvas: CanvasSize,
): FeaturePlacement {
  return {
    ...placement,
    x: canvas.width - placement.x - placement.width,
    y: canvas.height - placement.y - placement.height,
    rotation: ((placement.rotation ?? 0) + 180) % 360,
  };
}

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
    const copies =
      placement.mirror === false
        ? [placement]
        : [placement, mirrorPlacement(placement, canvas)];

    for (const copy of copies) {
      const g = makeElement("g");
      const rotation = copy.rotation ?? 0;
      g.setAttribute(
        "transform",
        `translate(${copy.x} ${copy.y}) ` +
          `rotate(${rotation} ${copy.width / 2} ${copy.height / 2})`,
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
