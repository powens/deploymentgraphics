import { injectTemplateDefs, makeBuildings } from "./buildings.js";
import { injectFeatureDefs, makeFeatures } from "./features.js";
import { injectIconDefs, makeIcons } from "./icons.js";
import { applyAttributes, makeElement } from "./dom-helpers.js";
import { toPoint } from "./building-coordinates.js";
import { baseTheme } from "./presets/theme.js";
import {
  DEFAULT_AREA_TERRAIN_SIZE,
  type AreaTerrain,
} from "./terrain-config.js";
import { resolveLayout, type ResolvedLayout } from "./layout.js";
import type { Theme } from "./theme.js";
import type { FullConfig, SVGProperties } from "./types.js";

// Resolve a building's SVG props: the shared group props as a base, then the
// template's own entry (or `default`). Used for both the template defs and the
// `<use>` placements so a pipe def and its uses share one style.
const buildingStyle =
  (theme: Theme) =>
  (name: string): SVGProperties => ({
    ...theme.building.group,
    ...(theme.building.template[name] ?? theme.building.template.default),
  });

function injectDefs(
  svg: SVGElement,
  config: FullConfig,
  theme: Theme,
  layout: ResolvedLayout,
) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  // Each template def carries the generic building props plus its own
  // template-specific stroke/fill overrides (keyed by name, with a default).
  injectTemplateDefs(config.terrain.templates, defs, buildingStyle(theme));

  if (layout.icons.length > 0) injectIconDefs(layout.icons, defs, theme);

  if (layout.features.length > 0) injectFeatureDefs(layout.features, defs);

  const hasArrow = config.annotations?.some((a) => a.kind === "arrow");
  if (hasArrow) {
    const marker = makeElement("marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.setAttribute("markerWidth", "4");
    marker.setAttribute("markerHeight", "3");
    marker.setAttribute("refX", "4");
    marker.setAttribute("refY", "1.5");
    marker.setAttribute("orient", "auto");
    const path = makeElement("path");
    path.setAttribute("d", "M 0 0 L 4 1.5 L 0 3 Z");
    path.setAttribute("fill", "black");
    marker.appendChild(path);
    defs.appendChild(marker);
  }
}

function makeHalfwayLines(config: FullConfig, theme: Theme): SVGElement | null {
  // Absent `draw` defaults to on; only an explicit `false` suppresses.
  if (config.base.half_way_lines.draw === false) {
    return null;
  }
  const group = makeElement("g");
  const guideConfig = theme.half_way_lines;

  const vertHalfLine = makeElement("line");
  vertHalfLine.setAttribute("x1", `${config.base.size.width / 2}`);
  vertHalfLine.setAttribute("y1", "0");
  vertHalfLine.setAttribute("x2", `${config.base.size.width / 2}`);
  vertHalfLine.setAttribute("y2", `${config.base.size.height}`);
  applyAttributes(vertHalfLine, guideConfig);
  group.appendChild(vertHalfLine);

  const horizHalfLine = makeElement("line");
  horizHalfLine.setAttribute("x1", "0");
  horizHalfLine.setAttribute("y1", `${config.base.size.height / 2}`);
  horizHalfLine.setAttribute("x2", `${config.base.size.width}`);
  horizHalfLine.setAttribute("y2", `${config.base.size.height / 2}`);
  applyAttributes(horizHalfLine, guideConfig);
  group.appendChild(horizHalfLine);

  return group;
}

function makeTerritoryLine(config: FullConfig, theme: Theme): SVGElement | null {
  // Absent `draw` defaults to on; only an explicit `false` suppresses. A
  // mission with no `territory` draws nothing regardless of the toggle.
  const territory = config.deployment.territory;
  if (!territory || config.base.territory.draw === false) {
    return null;
  }
  const start = toPoint(territory.start, "territory start");
  const end = toPoint(territory.end, "territory end");
  const line = makeElement("line");
  line.setAttribute("id", "territory");
  line.setAttribute("x1", `${start.x}`);
  line.setAttribute("y1", `${start.y}`);
  line.setAttribute("x2", `${end.x}`);
  line.setAttribute("y2", `${end.y}`);
  applyAttributes(line, theme.territory);
  return line;
}

function makeDeploymentZone(
  config: FullConfig,
  attackerDefender: "attacker" | "defender",
  theme: Theme,
): SVGElement {
  const playerConfig = config.deployment[attackerDefender];
  const colorConfig = theme.deployment[attackerDefender];
  const maskRadius = playerConfig.mask_center ?? 0;

  const dz = makeElement("polygon");
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
  const mask = makeElement("mask");
  mask.setAttribute("id", maskId);
  const visible = makeElement("rect");
  visible.setAttribute("x", "0");
  visible.setAttribute("y", "0");
  visible.setAttribute("width", `${config.base.size.width}`);
  visible.setAttribute("height", `${config.base.size.height}`);
  visible.setAttribute("fill", "white");
  const hole = makeElement("circle");
  hole.setAttribute("cx", `${config.base.size.width / 2}`);
  hole.setAttribute("cy", `${config.base.size.height / 2}`);
  hole.setAttribute("r", `${maskRadius}`);
  hole.setAttribute("fill", "black");
  mask.appendChild(visible);
  mask.appendChild(hole);
  dz.setAttribute("mask", `url(#${maskId})`);

  const group = makeElement("g");
  group.appendChild(mask);
  group.appendChild(dz);
  return group;
}

function makeGrid(config: FullConfig, theme: Theme): SVGElement | null {
  if (config?.base?.grid?.draw !== true) {
    return null;
  }
  const group = makeElement("g");
  applyAttributes(group, theme.grid);
  const size = config.base.size;

  for (let x = 1; x < size.width; x++) {
    const line = makeElement("line");
    line.setAttribute("x1", `${x}`);
    line.setAttribute("y1", "0");
    line.setAttribute("x2", `${x}`);
    line.setAttribute("y2", `${size.height}`);
    line.setAttribute("id", `grid-vertical-${x}`);
    group.appendChild(line);
  }
  for (let y = 1; y < size.height; y++) {
    const line = makeElement("line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", `${y}`);
    line.setAttribute("x2", `${size.width}`);
    line.setAttribute("y2", `${y}`);
    line.setAttribute("id", `grid-horizontal-${y}`);
    group.appendChild(line);
  }
  return group;
}

function makeAreaTerrain(
  items: AreaTerrain[],
  theme: Theme,
): SVGElement | null {
  if (items.length === 0) return null;
  const group = makeElement("g");
  group.setAttribute("id", "area-terrain");
  for (const item of items) {
    const style =
      theme.area_terrain[item.label ?? ""] ?? theme.area_terrain.default;
    let shape: SVGElement;
    if (item.shape === "circle") {
      const r = (item.width ?? DEFAULT_AREA_TERRAIN_SIZE) / 2;
      shape = makeElement("circle");
      shape.setAttribute("cx", `${item.x + r}`);
      shape.setAttribute("cy", `${item.y + r}`);
      shape.setAttribute("r", `${r}`);
    } else {
      const pts = (item.points ?? [])
        .map((raw) => toPoint(raw, "area_terrain points"))
        .map((p) => `${item.x + p.x},${item.y + p.y}`)
        .join(" ");
      shape = makeElement("polygon");
      shape.setAttribute("points", pts);
    }
    applyAttributes(shape, style);
    if (item.rotation) {
      const cx = item.x + (item.width ?? DEFAULT_AREA_TERRAIN_SIZE) / 2;
      const cy =
        item.y + (item.height ?? item.width ?? DEFAULT_AREA_TERRAIN_SIZE) / 2;
      shape.setAttribute("transform", `rotate(${item.rotation} ${cx} ${cy})`);
    }
    group.appendChild(shape);
  }
  return group;
}

/** Numbered objective markers sit on top of zones, terrain, and buildings. */
const OBJECTIVE_RADIUS = 1.5;

function makeObjectives(config: FullConfig, theme: Theme): SVGElement | null {
  const items = config.objectives;
  if (!items || items.length === 0) return null;
  const group = makeElement("g");
  group.setAttribute("id", "objectives");
  for (const item of items) {
    const marker = makeElement("circle");
    marker.setAttribute("cx", `${item.x}`);
    marker.setAttribute("cy", `${item.y}`);
    marker.setAttribute("r", `${OBJECTIVE_RADIUS}`);
    applyAttributes(marker, theme.objective.marker);
    group.appendChild(marker);

    const label = makeElement("text");
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

function makeAnnotations(config: FullConfig, theme: Theme): SVGElement | null {
  const items = config.annotations;
  if (!items || items.length === 0) return null;
  const group = makeElement("g");
  group.setAttribute("id", "annotations");
  applyAttributes(group, theme.annotation.text);
  for (const item of items) {
    if (item.kind === "text") {
      const el = makeElement("text");
      el.setAttribute("x", `${item.x}`);
      el.setAttribute("y", `${item.y}`);
      applyAttributes(el, theme.annotation.text_outline);
      el.textContent = item.text ?? "";
      group.appendChild(el);
    } else {
      const line = makeElement("line");
      line.setAttribute("x1", `${item.x}`);
      line.setAttribute("y1", `${item.y}`);
      line.setAttribute("x2", `${item.endX ?? item.x}`);
      line.setAttribute("y2", `${item.endY ?? item.y}`);
      applyAttributes(line, theme.annotation.arrow);
      line.setAttribute("marker-end", "url(#arrowhead)");
      group.appendChild(line);
    }
  }
  return group;
}

export function makeMissionCard(
  config: FullConfig,
  theme: Theme = baseTheme,
): SVGElement {
  const svg = makeElement("svg");
  svg.setAttribute(
    "viewBox",
    `0 0 ${config.base.size.width} ${config.base.size.height}`,
  );

  // Give assistive tech an accessible name for the rendered card.
  svg.setAttribute("role", "img");
  const title = makeElement("title");
  title.textContent = `Deployment map: ${config.deployment.name}`;
  svg.appendChild(title);

  if (theme.background.fill) {
    const background = makeElement("rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", `${config.base.size.width}`);
    background.setAttribute("height", `${config.base.size.height}`);
    background.setAttribute("fill", `${theme.background.fill}`);
    svg.appendChild(background);
  }

  // Resolve the selected layout once: its buildings/icons (empty when no
  // layout is selected) plus features/area-terrain unioned with the board's
  // top-level arrays. Every layout-dependent pass below reads from it.
  const layout = resolveLayout(config);
  const canvas = {
    width: config.base.size.width,
    height: config.base.size.height,
  };

  injectDefs(svg, config, theme, layout);

  svg.appendChild(makeDeploymentZone(config, "attacker", theme));
  svg.appendChild(makeDeploymentZone(config, "defender", theme));

  // Grid first so it sits behind everything else.
  const grid = makeGrid(config, theme);
  if (grid) {
    svg.appendChild(grid);
  }

  const halfwayLines = makeHalfwayLines(config, theme);
  if (halfwayLines) {
    svg.appendChild(halfwayLines);
  }

  const territory = makeTerritoryLine(config, theme);
  if (territory) {
    svg.appendChild(territory);
  }

  // An unbuilt layout yields empty placements, so this is an empty
  // `<g id="buildings">` — matching the legacy renderer's warn-and-skip.
  svg.appendChild(
    makeBuildings(
      layout.buildings,
      config.terrain.templates,
      canvas,
      buildingStyle(theme),
    ),
  );

  // Area terrain draws after buildings: imported 40kdc area pieces render as
  // opaque buildings, and the smaller feature pieces (l-ruins, pipes, ...) are
  // emitted as area_terrain that sits on top of them.
  const areaTerrain = makeAreaTerrain(layout.areaTerrain, theme);
  if (areaTerrain) {
    svg.appendChild(areaTerrain);
  }

  if (layout.features.length > 0) {
    svg.appendChild(makeFeatures(layout.features, theme, canvas));
  }

  const objectives = makeObjectives(config, theme);
  if (objectives) {
    svg.appendChild(objectives);
  }

  const annotations = makeAnnotations(config, theme);
  if (annotations) {
    svg.appendChild(annotations);
  }

  if (layout.icons.length > 0) svg.appendChild(makeIcons(layout.icons));

  return svg;
}

export function injectMissionCard(
  rootElement: SVGElement,
  config: FullConfig,
  theme: Theme = baseTheme,
) {
  const missionCard = makeMissionCard(config, theme);
  rootElement.appendChild(missionCard);
}
