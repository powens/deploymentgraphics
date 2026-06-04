import { injectTemplateDefs, makeBuildings } from "./buildings.js";
import { applyAttributes, makeElement } from "./dom-helpers.js";
import { DEFAULT_AREA_TERRAIN_SIZE, getLayoutBuildings } from "./terrain-config.js";
import type { FullConfig } from "./types.js";

/** True when a usable layout is selected in the terrain config. */
function hasSelectedLayout(config: FullConfig): boolean {
  return !!config.terrain.layout[config.terrain.layout_name];
}

function injectDefs(svg: SVGElement, config: FullConfig) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  // Template rects carry both the generic building props and the
  // template-specific stroke/fill overrides.
  const templateProps = {
    ...config.base.building.svg_properties,
    ...config.base.building.template,
  };
  injectTemplateDefs(config.terrain.templates, defs, templateProps);

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

function makeHalfwayLines(config: FullConfig): SVGElement | null {
  // Absent `draw` defaults to on; only an explicit `false` suppresses.
  if (config.base.half_way_lines.draw === false) {
    return null;
  }
  const group = makeElement("g");
  const guideConfig = config.base.half_way_lines.svg_properties;

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
): SVGElement {
  const playerConfig = config.deployment[attackerDefender];
  const colorConfig = config.base.deployment[attackerDefender];
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
    applyAttributes(dz, colorConfig.svg_properties);
    return dz;
  }

  const dz = makeElement("polygon");
  dz.setAttribute("id", attackerDefender);
  dz.setAttribute("points", playerConfig.deployment_zone.join(" "));
  applyAttributes(dz, colorConfig.svg_properties);
  return dz;
}

function makeGrid(config: FullConfig): SVGElement | null {
  if (config?.base?.grid?.draw !== true) {
    return null;
  }
  const group = makeElement("g");
  applyAttributes(group, config.base.grid.svg_properties);
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

const AREA_TERRAIN_STYLES: Record<string, { fill: string; stroke: string }> = {
  Forest: { fill: "rgba(60,120,60,0.3)", stroke: "#3a6b3a" },
  Crater: { fill: "rgba(100,80,60,0.3)", stroke: "#6b5030" },
  Rubble: { fill: "rgba(140,130,120,0.3)", stroke: "#807060" },
};
const DEFAULT_AREA_TERRAIN_STYLE = {
  fill: "rgba(140,130,120,0.2)",
  stroke: "#808080",
};

function makeAreaTerrain(config: FullConfig): SVGElement | null {
  const items = config.terrain.area_terrain;
  if (!items || items.length === 0) return null;
  const group = makeElement("g");
  group.setAttribute("id", "area-terrain");
  for (const item of items) {
    const style =
      AREA_TERRAIN_STYLES[item.label ?? ""] ?? DEFAULT_AREA_TERRAIN_STYLE;
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
    shape.setAttribute("fill", style.fill);
    shape.setAttribute("stroke", style.stroke);
    shape.setAttribute("stroke-width", "0.3");
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

function makeObjectives(config: FullConfig): SVGElement | null {
  const items = config.objectives;
  if (!items || items.length === 0) return null;
  const group = makeElement("g");
  group.setAttribute("id", "objectives");
  for (const item of items) {
    const marker = makeElement("circle");
    marker.setAttribute("cx", `${item.x}`);
    marker.setAttribute("cy", `${item.y}`);
    marker.setAttribute("r", `${OBJECTIVE_RADIUS}`);
    marker.setAttribute("fill", "#1a1a1a");
    marker.setAttribute("stroke", "white");
    marker.setAttribute("stroke-width", "0.3");
    group.appendChild(marker);

    const label = makeElement("text");
    label.setAttribute("x", `${item.x}`);
    label.setAttribute("y", `${item.y}`);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("font-size", "2");
    label.setAttribute("fill", "white");
    label.textContent = `${item.number}`;
    group.appendChild(label);
  }
  return group;
}

function makeAnnotations(config: FullConfig): SVGElement | null {
  const items = config.annotations;
  if (!items || items.length === 0) return null;
  const group = makeElement("g");
  group.setAttribute("id", "annotations");
  group.setAttribute("font-size", "1.5");
  group.setAttribute("fill", "black");
  for (const item of items) {
    if (item.kind === "text") {
      const el = makeElement("text");
      el.setAttribute("x", `${item.x}`);
      el.setAttribute("y", `${item.y}`);
      el.setAttribute("stroke", "white");
      el.setAttribute("stroke-width", "0.3");
      el.setAttribute("paint-order", "stroke");
      el.textContent = item.text ?? "";
      group.appendChild(el);
    } else {
      const line = makeElement("line");
      line.setAttribute("x1", `${item.x}`);
      line.setAttribute("y1", `${item.y}`);
      line.setAttribute("x2", `${item.endX ?? item.x}`);
      line.setAttribute("y2", `${item.endY ?? item.y}`);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "0.4");
      line.setAttribute("marker-end", "url(#arrowhead)");
      group.appendChild(line);
    }
  }
  return group;
}

export function makeMissionCard(config: FullConfig): SVGElement {
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

  if (config.base.background.fill) {
    const background = makeElement("rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", `${config.base.size.width}`);
    background.setAttribute("height", `${config.base.size.height}`);
    background.setAttribute("fill", `${config.base.background.fill}`);
    svg.appendChild(background);
  }

  injectDefs(svg, config);

  svg.appendChild(makeDeploymentZone(config, "attacker"));
  svg.appendChild(makeDeploymentZone(config, "defender"));

  // Grid first so it sits behind everything else.
  const grid = makeGrid(config);
  if (grid) {
    svg.appendChild(grid);
  }

  const halfwayLines = makeHalfwayLines(config);
  if (halfwayLines) {
    svg.appendChild(halfwayLines);
  }

  const areaTerrain = makeAreaTerrain(config);
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
        config.base.building.svg_properties,
      ),
    );
  } else {
    // No buildings group when the layout is unbuilt — mirrors the
    // legacy renderer's warn-and-skip behaviour.
    const empty = makeElement("g");
    empty.setAttribute("id", "buildings");
    svg.appendChild(empty);
  }

  const objectives = makeObjectives(config);
  if (objectives) {
    svg.appendChild(objectives);
  }

  const annotations = makeAnnotations(config);
  if (annotations) {
    svg.appendChild(annotations);
  }

  return svg;
}

export function injectMissionCard(rootElement: SVGElement, config: FullConfig) {
  const missionCard = makeMissionCard(config);
  rootElement.appendChild(missionCard);
}
