import { injectTemplateDefs, makeBuildings } from "./buildings.js";
import { injectFeatureDefs, makeFeatures } from "./features.js";
import { injectIconDefs, makeIcons } from "./icons.js";
import { applyAttributes } from "./dom-helpers.js";
import type { SvgDocument, SvgNode } from "./svg-backend.js";
import {
  toPoint,
  type BuildingPlacement,
  type CanvasSize,
} from "./building-coordinates.js";
import type { FeaturePlacement, IconPlacement } from "./terrain-config.js";
import type { Theme } from "./theme.js";
import type { FullConfig } from "./types.js";

/**
 * The board pieces a render pass actually draws, with the "is a layout
 * selected?" and "top-level array unioned with the layout's?" rules already
 * applied. `buildings` and `icons` come from the selected layout alone (empty
 * when none is selected); `features` unions the board's top-level array with
 * the layout's, so features draw with or without a layout.
 *
 * This is "layout-resolution" — assembling placement arrays — distinct from
 * `Resolve` in CONTEXT.md, which maps a single placement to a `Placed`.
 */
export type ResolvedLayout = {
  buildings: BuildingPlacement[];
  icons: IconPlacement[];
  features: FeaturePlacement[];
};

/**
 * Collects the pieces to draw for `config`'s selected layout. Always returns a
 * `ResolvedLayout` — an unbuilt layout yields empty `buildings`/`icons` rather
 * than throwing — so callers never guard on layout existence. The union order
 * is top-level first, then the layout's, matching draw order.
 */
export function resolveLayout(config: FullConfig): ResolvedLayout {
  const layout = config.terrain.layout[config.terrain.layout_name];
  return {
    buildings: layout?.templates ?? [],
    icons: layout?.icons ?? [],
    features: [...(config.features ?? []), ...(layout?.features ?? [])],
  };
}

/**
 * One drawable layer of the card.
 *
 * A layer owns both halves of what it takes to put one kind of piece on the
 * board: the shared shapes it hangs in `<defs>`, and the node that references
 * them. Those halves used to be two functions called from two places, agreeing
 * by hand on a presence guard and on a bare def id that nothing type-checked —
 * so adding a piece kind was four coordinated edits, and a dangling `href` was
 * only caught by rendering all 45 layouts and looking.
 *
 * `injectDefs` is optional because most layers draw straight from `config`.
 * Every layer that does hang a def also emits its own reference to it, so the
 * id never crosses a module edge.
 */
export interface Layer {
  /** Names the layer in draw order, and the `<g>` it emits where it has one. */
  readonly id: string;
  /** Appends this layer's shared shapes to the card's single `<defs>`. */
  injectDefs?(doc: SvgDocument, defs: SvgNode): void;
  /** The node to append, in draw order. */
  draw(doc: SvgDocument): SvgNode;
}

/** A layer plus its presence rule: written once, read by both halves. */
type LayerRow = Layer & { readonly draws: boolean };

function deploymentZone(
  doc: SvgDocument,
  config: FullConfig,
  attackerDefender: "attacker" | "defender",
  theme: Theme,
): SvgNode {
  const playerConfig = config.deployment[attackerDefender];
  const colorConfig = theme.deployment[attackerDefender];
  const maskRadius = playerConfig.mask_center ?? 0;

  const dz = doc.createElement("polygon");
  dz.setAttribute("id", attackerDefender);
  dz.setAttribute(
    "points",
    playerConfig.deployment_zone
      .map((raw) => toPoint(raw, `${attackerDefender} deployment_zone`))
      .map((p) => `${p.x},${p.y}`)
      .join(" "),
  );
  applyAttributes(dz, colorConfig);

  if (maskRadius <= 0) {
    return dz;
  }

  // Punch a circular hole at the board centre. A mask subtracts the circle
  // only where the zone actually is, so nothing bleeds outside the polygon
  // when the circle is centred on a zone corner (Search and Destroy).
  const maskId = `center-hole-${attackerDefender}`;
  const mask = doc.createElement("mask");
  mask.setAttribute("id", maskId);
  const visible = doc.createElement("rect");
  visible.setAttribute("x", "0");
  visible.setAttribute("y", "0");
  visible.setAttribute("width", `${config.base.size.width}`);
  visible.setAttribute("height", `${config.base.size.height}`);
  visible.setAttribute("fill", "white");
  const hole = doc.createElement("circle");
  hole.setAttribute("cx", `${config.base.size.width / 2}`);
  hole.setAttribute("cy", `${config.base.size.height / 2}`);
  hole.setAttribute("r", `${maskRadius}`);
  hole.setAttribute("fill", "black");
  mask.appendChild(visible);
  mask.appendChild(hole);
  dz.setAttribute("mask", `url(#${maskId})`);

  const group = doc.createElement("g");
  group.appendChild(mask);
  group.appendChild(dz);
  return group;
}

function grid(doc: SvgDocument, config: FullConfig, theme: Theme): SvgNode {
  const group = doc.createElement("g");
  applyAttributes(group, theme.grid);
  const size = config.base.size;

  for (let x = 1; x < size.width; x++) {
    const line = doc.createElement("line");
    line.setAttribute("x1", `${x}`);
    line.setAttribute("y1", "0");
    line.setAttribute("x2", `${x}`);
    line.setAttribute("y2", `${size.height}`);
    line.setAttribute("id", `grid-vertical-${x}`);
    group.appendChild(line);
  }
  for (let y = 1; y < size.height; y++) {
    const line = doc.createElement("line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", `${y}`);
    line.setAttribute("x2", `${size.width}`);
    line.setAttribute("y2", `${y}`);
    line.setAttribute("id", `grid-horizontal-${y}`);
    group.appendChild(line);
  }
  return group;
}

function halfwayLines(
  doc: SvgDocument,
  config: FullConfig,
  theme: Theme,
): SvgNode {
  const group = doc.createElement("g");
  const guideConfig = theme.half_way_lines;

  const vertHalfLine = doc.createElement("line");
  vertHalfLine.setAttribute("x1", `${config.base.size.width / 2}`);
  vertHalfLine.setAttribute("y1", "0");
  vertHalfLine.setAttribute("x2", `${config.base.size.width / 2}`);
  vertHalfLine.setAttribute("y2", `${config.base.size.height}`);
  applyAttributes(vertHalfLine, guideConfig);
  group.appendChild(vertHalfLine);

  const horizHalfLine = doc.createElement("line");
  horizHalfLine.setAttribute("x1", "0");
  horizHalfLine.setAttribute("y1", `${config.base.size.height / 2}`);
  horizHalfLine.setAttribute("x2", `${config.base.size.width}`);
  horizHalfLine.setAttribute("y2", `${config.base.size.height / 2}`);
  applyAttributes(horizHalfLine, guideConfig);
  group.appendChild(horizHalfLine);

  return group;
}

function territoryLine(
  doc: SvgDocument,
  config: FullConfig,
  theme: Theme,
): SvgNode {
  // Only reached when the row's presence rule found a territory.
  const territory = config.deployment.territory!;
  const start = toPoint(territory.start, "territory start");
  const end = toPoint(territory.end, "territory end");
  const line = doc.createElement("line");
  line.setAttribute("id", "territory");
  line.setAttribute("x1", `${start.x}`);
  line.setAttribute("y1", `${start.y}`);
  line.setAttribute("x2", `${end.x}`);
  line.setAttribute("y2", `${end.y}`);
  applyAttributes(line, theme.territory);
  return line;
}

/** Numbered objective markers sit on top of zones, terrain, and buildings. */
const OBJECTIVE_RADIUS = 1.5;

function objectives(
  doc: SvgDocument,
  config: FullConfig,
  theme: Theme,
): SvgNode {
  const group = doc.createElement("g");
  group.setAttribute("id", "objectives");
  for (const item of config.objectives ?? []) {
    const marker = doc.createElement("circle");
    marker.setAttribute("cx", `${item.x}`);
    marker.setAttribute("cy", `${item.y}`);
    marker.setAttribute("r", `${OBJECTIVE_RADIUS}`);
    applyAttributes(marker, theme.objective.marker);
    group.appendChild(marker);

    const label = doc.createElement("text");
    label.setAttribute("x", `${item.x}`);
    label.setAttribute("y", `${item.y}`);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    applyAttributes(label, theme.objective.label);
    label.textContent = `${item.number}`;
    group.appendChild(label);
  }
  return group;
}

/** The def an annotation arrow's `marker-end` points at. */
const ARROWHEAD_ID = "arrowhead";

function injectArrowhead(doc: SvgDocument, defs: SvgNode): void {
  const marker = doc.createElement("marker");
  marker.setAttribute("id", ARROWHEAD_ID);
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("markerWidth", "4");
  marker.setAttribute("markerHeight", "3");
  marker.setAttribute("refX", "4");
  marker.setAttribute("refY", "1.5");
  marker.setAttribute("orient", "auto");
  const path = doc.createElement("path");
  path.setAttribute("d", "M 0 0 L 4 1.5 L 0 3 Z");
  path.setAttribute("fill", "black");
  marker.appendChild(path);
  defs.appendChild(marker);
}

function annotations(
  doc: SvgDocument,
  config: FullConfig,
  theme: Theme,
): SvgNode {
  const group = doc.createElement("g");
  group.setAttribute("id", "annotations");
  applyAttributes(group, theme.annotation.text);
  for (const item of config.annotations ?? []) {
    if (item.kind === "text") {
      const el = doc.createElement("text");
      el.setAttribute("x", `${item.x}`);
      el.setAttribute("y", `${item.y}`);
      applyAttributes(el, theme.annotation.text_outline);
      el.textContent = item.text ?? "";
      group.appendChild(el);
    } else {
      const line = doc.createElement("line");
      line.setAttribute("x1", `${item.x}`);
      line.setAttribute("y1", `${item.y}`);
      line.setAttribute("x2", `${item.endX ?? item.x}`);
      line.setAttribute("y2", `${item.endY ?? item.y}`);
      applyAttributes(line, theme.annotation.arrow);
      line.setAttribute("marker-end", `url(#${ARROWHEAD_ID})`);
      group.appendChild(line);
    }
  }
  return group;
}

/**
 * The layers this card draws, in draw order.
 *
 * One row per layer, each stating its own presence rule once — adding a piece
 * kind is one row here rather than four coordinated edits across two functions.
 * Rows that draw nothing are dropped, so neither half of the render pass
 * guards again.
 */
export function cardLayers(config: FullConfig, theme: Theme): Layer[] {
  const layout = resolveLayout(config);
  const canvas: CanvasSize = {
    width: config.base.size.width,
    height: config.base.size.height,
  };

  const rows: LayerRow[] = [
    {
      id: "attacker",
      draws: true,
      draw: (doc) => deploymentZone(doc, config, "attacker", theme),
    },
    {
      id: "defender",
      draws: true,
      draw: (doc) => deploymentZone(doc, config, "defender", theme),
    },
    // Grid first so it sits behind everything else.
    {
      id: "grid",
      draws: config?.base?.grid?.draw === true,
      draw: (doc) => grid(doc, config, theme),
    },
    {
      // Absent `draw` defaults to on; only an explicit `false` suppresses.
      id: "half-way-lines",
      draws: config.base.half_way_lines.draw !== false,
      draw: (doc) => halfwayLines(doc, config, theme),
    },
    {
      // A mission with no `territory` draws nothing regardless of the toggle.
      id: "territory",
      draws:
        Boolean(config.deployment.territory) &&
        config.base.territory.draw !== false,
      draw: (doc) => territoryLine(doc, config, theme),
    },
    {
      // An unbuilt layout yields empty placements, so this is an empty
      // `<g id="buildings">` — matching the legacy renderer's warn-and-skip.
      // The template defs go in whether or not anything references them: they
      // are the board's template set, not this layout's.
      id: "buildings",
      draws: true,
      injectDefs: (doc, defs) =>
        injectTemplateDefs(doc, config.terrain.templates, defs, theme),
      draw: (doc) =>
        makeBuildings(doc, layout.buildings, config.terrain.templates, canvas, theme),
    },
    {
      // Features draw after buildings: the imported 40kdc area pieces render
      // as opaque buildings, and the smaller pieces (l-ruins, generators,
      // gantries) sit on top of them.
      id: "features",
      draws: layout.features.length > 0,
      injectDefs: (doc, defs) => injectFeatureDefs(doc, layout.features, defs),
      draw: (doc) => makeFeatures(doc, layout.features, theme, canvas),
    },
    {
      id: "objectives",
      draws: (config.objectives?.length ?? 0) > 0,
      draw: (doc) => objectives(doc, config, theme),
    },
    {
      id: "annotations",
      draws: (config.annotations?.length ?? 0) > 0,
      // Only an arrow annotation references the marker; text-only boards emit
      // no def for it.
      injectDefs: config.annotations?.some((a) => a.kind === "arrow")
        ? injectArrowhead
        : undefined,
      draw: (doc) => annotations(doc, config, theme),
    },
    {
      id: "icons",
      draws: layout.icons.length > 0,
      injectDefs: (doc, defs) => injectIconDefs(doc, layout.icons, defs, theme),
      draw: (doc) => makeIcons(doc, layout.icons),
    },
  ];

  return rows.filter((row) => row.draws);
}
