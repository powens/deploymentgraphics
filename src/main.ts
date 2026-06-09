import { injectTemplateDefs, makeBuildings } from "./buildings.js";
import { injectIconDefs, makeIcons } from "./icons.js";
import { applyAttributes, makeElement } from "./dom-helpers.js";
import { baseTheme } from "./presets/theme.js";
import {
  DEFAULT_AREA_TERRAIN_SIZE,
  getLayoutBuildings,
  getLayoutIcons,
} from "./terrain-config.js";
import type { Theme } from "./theme.js";
import type { FullConfig } from "./types.js";

/** True when a usable layout is selected in the terrain config. */
function hasSelectedLayout(config: FullConfig): boolean {
  return !!config.terrain.layout[config.terrain.layout_name];
}

function injectDefs(svg: SVGElement, config: FullConfig, theme: Theme) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  // Template rects carry both the generic building props and the
  // template-specific stroke/fill overrides.
  const templateProps = {
    ...theme.building.group,
    ...theme.building.template,
  };
  injectTemplateDefs(config.terrain.templates, defs, templateProps);

  if (hasSelectedLayout(config)) {
    const iconTypes = getLayoutIcons(
      config.terrain,
      config.terrain.layout_name,
    ).map((i) => i.type);
    if (iconTypes.length > 0) injectIconDefs(iconTypes, defs, theme);
  }

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

function makeDeploymentZone(
  config: FullConfig,
  attackerDefender: "attacker" | "defender",
  theme: Theme,
): SVGElement {
  const playerConfig = config.deployment[attackerDefender];
  const colorConfig = theme.deployment[attackerDefender];
  const maskRadius = playerConfig.mask_center ?? 0;

  if (maskRadius > 0) {
    const cx = config.base.size.width / 2;
    const cy = config.base.size.height / 2;
    const r = maskRadius;
    const polyPath = playerConfig.deployment_zone
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`)
      .join(" ") + " Z";
    const circlePath =
      `M${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy}` +
      ` A${r},${r} 0 1 0 ${cx + r},${cy} Z`;
    const dz = makeElement("path");
    dz.setAttribute("id", attackerDefender);
    dz.setAttribute("fill-rule", "evenodd");
    dz.setAttribute("d", `${polyPath} ${circlePath}`);
    applyAttributes(dz, colorConfig);
    return dz;
  }

  const dz = makeElement("polygon");
  dz.setAttribute("id", attackerDefender);
  dz.setAttribute("points", playerConfig.deployment_zone.join(" "));
  applyAttributes(dz, colorConfig);
  return dz;
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

function makeAreaTerrain(config: FullConfig, theme: Theme): SVGElement | null {
  const items = config.terrain.area_terrain;
  if (!items || items.length === 0) return null;
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
        .map(([px, py]: [number, number]) => `${item.x + px},${item.y + py}`)
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

  injectDefs(svg, config, theme);

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

  const areaTerrain = makeAreaTerrain(config, theme);
  if (areaTerrain) {
    svg.appendChild(areaTerrain);
  }

  if (hasSelectedLayout(config)) {
    const placements = getLayoutBuildings(
      config.terrain,
      config.terrain.layout_name,
    );
    const canvas = {
      width: config.base.size.width,
      height: config.base.size.height,
    };
    svg.appendChild(
      makeBuildings(
        placements,
        config.terrain.templates,
        canvas,
        theme.building.group,
      ),
    );
  } else {
    // No buildings group when the layout is unbuilt — mirrors the
    // legacy renderer's warn-and-skip behaviour.
    const empty = makeElement("g");
    empty.setAttribute("id", "buildings");
    svg.appendChild(empty);
  }

  const objectives = makeObjectives(config, theme);
  if (objectives) {
    svg.appendChild(objectives);
  }

  const annotations = makeAnnotations(config, theme);
  if (annotations) {
    svg.appendChild(annotations);
  }

  if (hasSelectedLayout(config)) {
    const iconPlacements = getLayoutIcons(
      config.terrain,
      config.terrain.layout_name,
    );
    if (iconPlacements.length > 0) svg.appendChild(makeIcons(iconPlacements));
  }

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
