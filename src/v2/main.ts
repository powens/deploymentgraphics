import { injectTemplateDefs, makeBuildings } from "./buildings";
import { getCoordinates } from "./coordinates";
import { applyAttributes, makeElement } from "./dom-helpers";
import { injectObjectiveDefs, makeObjectives } from "./objectives";
import { getLayoutBuildings } from "./terrain-config";
import type { FullConfig } from "./types";

function injectCenterMask(defs: SVGElement, config: FullConfig) {
  const centerMask = makeElement("mask");
  centerMask.setAttribute("id", "centerMask");

  const fullRect = makeElement("rect");
  fullRect.setAttribute("x", "0");
  fullRect.setAttribute("y", "0");
  fullRect.setAttribute("width", `${config.base.size.width}`);
  fullRect.setAttribute("height", `${config.base.size.height}`);
  fullRect.setAttribute("fill", "white");
  centerMask.appendChild(fullRect);

  const centerCircle = makeElement("circle");
  centerCircle.setAttribute("cx", `${config.base.size.width / 2}`);
  centerCircle.setAttribute("cy", `${config.base.size.height / 2}`);
  centerCircle.setAttribute("r", "9");
  centerCircle.setAttribute("fill", "black");
  centerMask.appendChild(centerCircle);
  defs.appendChild(centerMask);
}

/** True when a usable layout is selected in the terrain config. */
function hasSelectedLayout(config: FullConfig): boolean {
  return (
    !!config.terrain &&
    !!config.terrain.layout[config.terrain.layout_name]
  );
}

function injectDefs(svg: SVGElement, config: FullConfig) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  injectObjectiveDefs(defs, config);

  if (config.terrain) {
    // Template rects carry both the generic building props and the
    // template-specific stroke/fill overrides.
    const templateProps = {
      ...config.base.building.svg_properties,
      ...config.base.building.template,
    };
    injectTemplateDefs(config.terrain.templates, defs, templateProps);
  }

  injectCenterMask(defs, config);
}

function makeHalfwayLines(config: FullConfig): SVGElement {
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
  const dz = makeElement("polygon");
  const coordinateStr = playerConfig.deployment_zone
    .map((coords) => getCoordinates(config, coords))
    .join(" ");
  dz.setAttribute("points", coordinateStr);
  dz.setAttribute("fill", `${colorConfig.svg_properties.fill}`);
  dz.setAttribute("stroke", `${colorConfig.svg_properties.stroke}`);
  dz.setAttribute("stroke-width", "0.4");
  if (playerConfig.mask_center) {
    dz.setAttribute("mask", "url(#centerMask)");
  }
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

export function makeMissionCard(config: FullConfig): SVGElement {
  const svg = makeElement("svg");
  svg.setAttribute(
    "viewBox",
    `0 0 ${config.base.size.width} ${config.base.size.height}`,
  );
  if (config.base.background.fill) {
    svg.setAttribute("fill", `${config.base.background.fill}`);
  }

  injectDefs(svg, config);

  svg.appendChild(makeDeploymentZone(config, "attacker"));
  svg.appendChild(makeDeploymentZone(config, "defender"));

  // Grid first so it sits behind everything else.
  const grid = makeGrid(config);
  if (grid) {
    svg.appendChild(grid);
  }

  svg.appendChild(makeObjectives(config));
  svg.appendChild(makeHalfwayLines(config));

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

  return svg;
}

export function injectMissionCard(rootElement: SVGElement, config: FullConfig) {
  const missionCard = makeMissionCard(config);
  rootElement.appendChild(missionCard);
}
