import { buildingLayer } from "./buildings.js";
import { featureLayer } from "./features.js";
import { iconLayer } from "./icons.js";
import { applyAttributes } from "./dom-helpers.js";
import type { Layer, LayerRow } from "./layer.js";
import type { SvgDocument, SvgNode } from "./svg-backend.js";
import type { BuildingPlacement, CanvasSize } from "./building-coordinates.js";
import type { FeaturePlacement, IconPlacement } from "./terrain-config.js";
import type { Theme } from "./theme.js";
import type { BaseConfig, FullConfig } from "./types.js";

/**
 * The pieces a render pass draws. `buildings` and `icons` come from the
 * selected layout alone (empty when none is selected); `features` is the
 * board's top-level array plus the layout's.
 */
export type ResolvedLayout = {
  buildings: BuildingPlacement[];
  icons: IconPlacement[];
  features: FeaturePlacement[];
};

/**
 * No layout (`layout_name: ""`) yields empty `buildings`/`icons`; that any
 * other id is a key of `terrain.layout` is `checkConfig`'s to ensure.
 * Features are top-level first, then the layout's (draw order).
 */
export function resolveLayout(config: FullConfig): ResolvedLayout {
  const { layout: layouts, layout_name: name } = config.terrain;
  const layout = name === "" ? undefined : layouts[name];
  return {
    buildings: layout?.templates ?? [],
    icons: layout?.icons ?? [],
    features: [...(config.features ?? []), ...(layout?.features ?? [])],
  };
}

/**
 * Read one of `BaseConfig`'s `{ draw?: boolean }` toggles; the default for an
 * absent `draw` differs per toggle.
 *
 * `Boolean` is needed despite the type: the viewer's YAML tab passes unvalidated
 * input, and js-yaml 4 parses `no`/`off`/`yes`/`on` as strings. (`"no"` is still
 * truthy; this only keeps `draws` a real boolean.)
 */
function drawn(
  base: BaseConfig,
  key: "grid" | "half_way_lines" | "territory",
  whenAbsent: boolean,
): boolean {
  return Boolean(base[key].draw ?? whenAbsent);
}

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
    playerConfig.deployment_zone.map((p) => `${p.x},${p.y}`).join(" "),
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
  territory: NonNullable<FullConfig["deployment"]["territory"]>,
  theme: Theme,
): SvgNode {
  const { start, end } = territory;
  const line = doc.createElement("line");
  line.setAttribute("id", "territory");
  line.setAttribute("x1", `${start.x}`);
  line.setAttribute("y1", `${start.y}`);
  line.setAttribute("x2", `${end.x}`);
  line.setAttribute("y2", `${end.y}`);
  applyAttributes(line, theme.territory);
  return line;
}

/** Objective marker radius, in inches. */
const OBJECTIVE_RADIUS = 1.5;

function objectives(
  doc: SvgDocument,
  config: FullConfig,
  theme: Theme,
): SvgNode {
  const group = doc.createElement("g");
  group.setAttribute("id", "objectives");
  for (const { x, y, number } of config.objectives ?? []) {
    const marker = doc.createElement("circle");
    marker.setAttribute("cx", `${x}`);
    marker.setAttribute("cy", `${y}`);
    marker.setAttribute("r", `${OBJECTIVE_RADIUS}`);
    applyAttributes(marker, theme.objective.marker);
    group.appendChild(marker);

    const label = doc.createElement("text");
    label.setAttribute("x", `${x}`);
    label.setAttribute("y", `${y}`);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    applyAttributes(label, theme.objective.label);
    label.textContent = `${number}`;
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
    const { x, y } = item;
    if (item.kind === "text") {
      const el = doc.createElement("text");
      el.setAttribute("x", `${x}`);
      el.setAttribute("y", `${y}`);
      applyAttributes(el, theme.annotation.text_outline);
      el.textContent = item.text ?? "";
      group.appendChild(el);
    } else {
      const endX = item.endX ?? x;
      const endY = item.endY ?? y;
      const line = doc.createElement("line");
      line.setAttribute("x1", `${x}`);
      line.setAttribute("y1", `${y}`);
      line.setAttribute("x2", `${endX}`);
      line.setAttribute("y2", `${endY}`);
      applyAttributes(line, theme.annotation.arrow);
      line.setAttribute("marker-end", `url(#${ARROWHEAD_ID})`);
      group.appendChild(line);
    }
  }
  return group;
}

/**
 * The layers this card draws, in draw order, with non-drawing rows dropped.
 * Adding a piece kind means adding a row here.
 */
export function cardLayers(config: FullConfig, theme: Theme): Layer[] {
  const layout = resolveLayout(config);
  const canvas: CanvasSize = {
    width: config.base.size.width,
    height: config.base.size.height,
  };
  const territory = config.deployment.territory;

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
    // Grid goes under everything except the zones.
    {
      id: "grid",
      draws: drawn(config.base, "grid", false),
      draw: (doc) => grid(doc, config, theme),
    },
    {
      id: "half-way-lines",
      draws: drawn(config.base, "half_way_lines", true),
      draw: (doc) => halfwayLines(doc, config, theme),
    },
    {
      // A mission with no `territory` draws nothing regardless of the toggle.
      id: "territory",
      draws: Boolean(territory) && drawn(config.base, "territory", true),
      draw: (doc) => territoryLine(doc, territory!, theme),
    },
    buildingLayer(layout.buildings, config.terrain.templates, canvas, theme),
    // After buildings: 40kdc area pieces render as opaque buildings, and the
    // smaller pieces (l-ruins, generators, gantries) sit on top.
    featureLayer(layout.features, theme, canvas),
    {
      id: "objectives",
      draws: (config.objectives?.length ?? 0) > 0,
      draw: (doc) => objectives(doc, config, theme),
    },
    {
      id: "annotations",
      draws: (config.annotations?.length ?? 0) > 0,
      // Only arrows reference the marker.
      injectDefs: config.annotations?.some((a) => a.kind === "arrow")
        ? injectArrowhead
        : undefined,
      draw: (doc) => annotations(doc, config, theme),
    },
    iconLayer(layout.icons, theme),
  ];

  return rows.filter((row) => row.draws);
}
