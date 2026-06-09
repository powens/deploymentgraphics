import { applyAttributes, makeElement } from "./dom-helpers.js";
import type { IconPlacement } from "./terrain-config.js";
import type { Theme } from "./theme.js";

/** Bounding-box edge of an icon, in inches. */
export const ICON_SIZE = 4;

export type IconShape =
  | { tag: "circle"; cx: number; cy: number; r: number }
  | { tag: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { tag: "rect"; x: number; y: number; width: number; height: number }
  | { tag: "path"; d: string };

/**
 * A predefined icon, authored in a 4×4" box with the circle centered at (2,2).
 * `glyph.body` is glyph-colored; `glyph.cutouts` are painted with the circle
 * fill so they read as the disk background; `glyph.transform` scales imported
 * art into the box (the circle is never transformed, so its border stays in
 * inches).
 */
export type IconDef = {
  circle: { cx: number; cy: number; r: number };
  glyph: { transform?: string; body: IconShape[]; cutouts?: IconShape[] };
};

// Classic round skull (domed cranium, two round eye-socket holes, four teeth,
// no nose), adapted from a 32×32 source path; eye holes let the disk show
// through. Scaled to ~2.8" and centered: translate(0.6) + scale(0.0875).
const SKULL_PATH =
  "M16 0C7.164 0 0 6.27 0 14c0 4.383 2.305 8.29 5.906 10.855.602.434.95 1.133" +
  ".844 1.872l-.586 4.136A.991.991 0 0 0 7.144 32H12v-3.5c0-.273.227-.5.5-.5h1" +
  "c.273 0 .5.227.5.5V32h4v-3.5c0-.273.227-.5.5-.5h1c.273 0 .5.227.5.5V32h4.855" +
  "c.606 0 1.07-.54.98-1.137l-.585-4.136c-.105-.735.238-1.438.844-1.872C29.695 " +
  "22.29 32 18.383 32 14c0-7.73-7.164-14-16-14Zm-6 20c-2.207 0-4-1.793-4-4s1.793" +
  "-4 4-4 4 1.793 4 4-1.793 4-4 4Zm12 0c-2.207 0-4-1.793-4-4s1.793-4 4-4 4 1.793 " +
  "4 4-1.793 4-4 4Zm0 0";

const skull: IconDef = {
  circle: { cx: 2, cy: 2, r: 1.875 },
  glyph: {
    transform: "translate(0.6 0.6) scale(0.0875)",
    body: [{ tag: "path", d: SKULL_PATH }],
  },
};

// Single keep: one battlemented tower with crenellation notches, two arrow
// slits, and an arched gate (cutouts). Authored directly in inch coordinates.
const fortress: IconDef = {
  circle: { cx: 2, cy: 2, r: 1.875 },
  glyph: {
    body: [{ tag: "rect", x: 1.1, y: 0.85, width: 1.8, height: 2.3 }],
    cutouts: [
      { tag: "rect", x: 1.325, y: 0.85, width: 0.3, height: 0.32 },
      { tag: "rect", x: 1.85, y: 0.85, width: 0.3, height: 0.32 },
      { tag: "rect", x: 2.375, y: 0.85, width: 0.3, height: 0.32 },
      { tag: "rect", x: 1.42, y: 1.5, width: 0.16, height: 0.5 },
      { tag: "rect", x: 2.42, y: 1.5, width: 0.16, height: 0.5 },
      { tag: "path", d: "M1.68 3.15 L1.68 2.55 Q2 2.25 2.32 2.55 L2.32 3.15 Z" },
    ],
  },
};

export const icons: Record<string, IconDef> = { skull, fortress };

function makeShape(shape: IconShape): SVGElement {
  switch (shape.tag) {
    case "circle": {
      const el = makeElement("circle");
      el.setAttribute("cx", `${shape.cx}`);
      el.setAttribute("cy", `${shape.cy}`);
      el.setAttribute("r", `${shape.r}`);
      return el;
    }
    case "ellipse": {
      const el = makeElement("ellipse");
      el.setAttribute("cx", `${shape.cx}`);
      el.setAttribute("cy", `${shape.cy}`);
      el.setAttribute("rx", `${shape.rx}`);
      el.setAttribute("ry", `${shape.ry}`);
      return el;
    }
    case "rect": {
      const el = makeElement("rect");
      el.setAttribute("x", `${shape.x}`);
      el.setAttribute("y", `${shape.y}`);
      el.setAttribute("width", `${shape.width}`);
      el.setAttribute("height", `${shape.height}`);
      return el;
    }
    case "path": {
      const el = makeElement("path");
      el.setAttribute("d", shape.d);
      return el;
    }
  }
}

/** Def element id for an icon, suffixed by player when the disk is tinted. */
function iconDefId(type: string, player?: "attacker" | "defender"): string {
  return player ? `icon-${type}-${player}` : `icon-${type}`;
}

/**
 * Appends one `<g id="icon-<type>[-<player>]">` per distinct (type, player) pair
 * used in `placements`. The disk fill resolves from `theme.deployment[player]`
 * when tagged, else `theme.icon.circle`; the glyph body takes `theme.icon.glyph`
 * and the cutouts take the resolved disk fill so they read as the disk showing
 * through. Throws on an unknown type.
 */
export function injectIconDefs(
  placements: IconPlacement[],
  defs: SVGElement,
  theme: Theme,
): void {
  const seen = new Set<string>();
  for (const { type, player } of placements) {
    const id = iconDefId(type, player);
    if (seen.has(id)) continue;
    seen.add(id);
    const def = icons[type];
    if (!def) throw new Error(`unknown icon type: ${type}`);

    const diskFill = player
      ? `${theme.deployment[player].fill}`
      : `${theme.icon.circle.fill}`;

    const group = makeElement("g");
    group.setAttribute("id", id);

    const circle = makeElement("circle");
    circle.setAttribute("cx", `${def.circle.cx}`);
    circle.setAttribute("cy", `${def.circle.cy}`);
    circle.setAttribute("r", `${def.circle.r}`);
    applyAttributes(circle, theme.icon.circle);
    circle.setAttribute("fill", diskFill);
    group.appendChild(circle);

    const glyph = makeElement("g");
    if (def.glyph.transform) glyph.setAttribute("transform", def.glyph.transform);
    for (const shape of def.glyph.body) {
      const el = makeShape(shape);
      applyAttributes(el, theme.icon.glyph);
      glyph.appendChild(el);
    }
    for (const shape of def.glyph.cutouts ?? []) {
      const el = makeShape(shape);
      el.setAttribute("fill", diskFill);
      glyph.appendChild(el);
    }
    group.appendChild(glyph);
    defs.appendChild(group);
  }
}

/**
 * Builds a `<g id="icons">` of `<use>` elements, one per placement, each
 * referencing its `#icon-<type>` def and translated so the 4×4" design box is
 * recentered on `pos`. Throws on an unknown type.
 */
export function makeIcons(placements: IconPlacement[]): SVGElement {
  const group = makeElement("g");
  group.setAttribute("id", "icons");
  let counter = 0;
  for (const placement of placements) {
    if (!icons[placement.type]) {
      throw new Error(`unknown icon type: ${placement.type}`);
    }
    const use = makeElement("use");
    use.setAttribute("href", `#${iconDefId(placement.type, placement.player)}`);
    const [x, y] = placement.pos;
    use.setAttribute(
      "transform",
      `translate(${x - ICON_SIZE / 2} ${y - ICON_SIZE / 2})`,
    );
    use.setAttribute("id", `icon-${counter}`);
    group.appendChild(use);
    counter++;
  }
  return group;
}
