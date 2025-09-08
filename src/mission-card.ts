import {
  getCoordinates,
  getHiddenSuppliesCoords,
  isCenterObjective,
} from "./coordinates";
import { makeBuildings, injectTemplateDefs } from "./buildings";
import { applyAttributes, makeElement } from "./dom-helpers";
import { Coordinate, FullConfig } from "./types";

function makeObjectiveMarker(config: FullConfig) {
  const objConfig = config.base.objective;
  const objGroup = makeElement("g");
  objGroup.setAttribute("id", "objMarker");

  const objMarker = makeElement("circle");
  objMarker.setAttribute("cx", "0");
  objMarker.setAttribute("cy", "0");
  applyAttributes(objMarker, objConfig.real.svg_properties);

  const objRadius = makeElement("circle");
  objRadius.setAttribute("cx", "0");
  objRadius.setAttribute("cy", "0");
  objRadius.setAttribute(
    "r",
    `${(objConfig.influence.radius ?? 0) + (objConfig.real.radius ?? 0)}`
  );
  applyAttributes(objRadius, objConfig.influence.svg_properties);

  objGroup.appendChild(objRadius);
  objGroup.appendChild(objMarker);

  return objGroup;
}

function makeArrowMarker(config: FullConfig) {
  const marker = makeElement("marker");
  marker.setAttribute("id", "arrowhead");
  marker.setAttribute("markerWidth", "10");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "3.5");
  marker.setAttribute("orient", "auto");

  const polygon = makeElement("polygon");
  polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
  applyAttributes(polygon, config.base.objective.guides.line.svg_properties);

  marker.appendChild(polygon);
  return marker;
}

function injectCenterMask(svg: SVGElement, config: FullConfig) {
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
  svg.appendChild(centerMask);
}

function injectDefs(svg: SVGElement, config: FullConfig) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  const objMarker = makeObjectiveMarker(config);
  defs.appendChild(objMarker);

  // Add arrow marker for measurement guides
  const arrowMarker = makeArrowMarker(config);
  defs.appendChild(arrowMarker);

  injectTemplateDefs(config, defs);

  injectCenterMask(svg, config);
}

/**
 * Makes the half-way lines for the mission
 */
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

function makeObjectives(config: FullConfig) {
  const objectiveGroup = makeElement("g");
  const size = config.base.size;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;

  const objectives = config?.deployment?.objectives ?? [];

  for (let coordinates of objectives) {
    if (isCenterObjective(coordinates) && config.deployment?.hidden_supplies) {
      const hiddenSupplesCoords = getHiddenSuppliesCoords();
      const o1 = makeElement("use");
      o1.setAttribute("x", `${halfWidth - hiddenSupplesCoords[0]}`);
      o1.setAttribute("y", `${halfHeight - hiddenSupplesCoords[1]}`);
      o1.setAttribute("href", "#objMarker");

      const o2 = makeElement("use");
      o2.setAttribute("x", `${halfWidth + hiddenSupplesCoords[0]}`);
      o2.setAttribute("y", `${halfHeight + hiddenSupplesCoords[1]}`);
      o2.setAttribute("href", "#objMarker");
      objectiveGroup.appendChild(o1);
      objectiveGroup.appendChild(o2);

      // Add measurement arrows for hidden supplies objectives
      if (config?.base?.objective?.guides?.line?.draw) {
        const coord1 = [-hiddenSupplesCoords[0], -hiddenSupplesCoords[1]];
        const coord2 = [hiddenSupplesCoords[0], hiddenSupplesCoords[1]];

        // objectiveGroup.appendChild(
        //   makeMeasurementArrow(coord1, config, "horizontal")
        // );
        // objectiveGroup.appendChild(
        //   makeMeasurementArrow(coord1, config, "vertical")
        // );
        // objectiveGroup.appendChild(
        //   makeMeasurementArrow(coord2, config, "horizontal")
        // );
        // objectiveGroup.appendChild(
        //   makeMeasurementArrow(coord2, config, "vertical")
        // );
      }
    } else {
      const o = makeElement("use");
      const translated = getCoordinates(config, coordinates);
      o.setAttribute("x", `${translated[0]}`);
      o.setAttribute("y", `${translated[1]}`);
      o.setAttribute("href", "#objMarker");

      // Add measurement arrows for regular objectives
      // if (config?.base?.objective?.guides?.draw) {
      //   objectiveGroup.appendChild(
      //     makeMeasurementArrow(coordinates, config, "horizontal")
      //   );
      //   objectiveGroup.appendChild(
      //     makeMeasurementArrow(coordinates, config, "vertical")
      //   );
      // }

      objectiveGroup.appendChild(o);
    }
  }

  return objectiveGroup;
}

function calculateDistanceToNearestEdge(
  objCoord: Coordinate,
  config: FullConfig
) {
  const size = config.base.size;
  const centerX = size.width / 2;
  const centerY = size.height / 2;

  // Convert from relative coordinates to absolute
  const absX = objCoord[0] + centerX;
  const absY = objCoord[1] + centerY;

  // Calculate distances to each edge
  const leftDist = absX;
  const rightDist = size.width - absX;
  const topDist = absY;
  const bottomDist = size.height - absY;

  // Find minimum distances for horizontal and vertical
  const horizontalData =
    leftDist < rightDist
      ? { distance: leftDist, direction: "left", edge: "left" }
      : { distance: rightDist, direction: "right", edge: "right" };

  const verticalData =
    topDist < bottomDist
      ? { distance: topDist, direction: "up", edge: "top" }
      : { distance: bottomDist, direction: "down", edge: "bottom" };

  return { horizontal: horizontalData, vertical: verticalData };
}

function makeMeasurementArrow(
  objCoord: Coordinate,
  config: FullConfig,
  type: "horizontal" | "vertical"
): SVGElement | null {
  if (config?.base?.objective?.guides?.line?.draw !== true) {
    return null;
  }
  const size = config.base.size;
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const guideConfig = config.base.objective.guides;

  // Get absolute position of objective
  const objAbsX = objCoord[0] + centerX;
  const objAbsY = objCoord[1] + centerY;

  const distances = calculateDistanceToNearestEdge(objCoord, config);

  const group = makeElement("g");

  let startX, startY, endX, endY, distance, textX, textY, textAnchor;

  if (type === "horizontal") {
    const data = distances.horizontal;
    distance = data.distance;

    if (data.direction === "left") {
      startX = objAbsX;
      startY = objAbsY;
      endX = 0;
      endY = objAbsY;
      textX = startX / 2;
      textY = objAbsY - 1;
    } else {
      startX = objAbsX;
      startY = objAbsY;
      endX = size.width;
      endY = objAbsY;
      textX = (startX + endX) / 2;
      textY = objAbsY - 1;
    }
    textAnchor = "middle";
  } else {
    const data = distances.vertical;
    distance = data.distance;

    if (data.direction === "up") {
      startX = objAbsX;
      startY = objAbsY;
      endX = objAbsX;
      endY = 0;
      textX = objAbsX + 1;
      textY = startY / 2;
    } else {
      startX = objAbsX;
      startY = objAbsY;
      endX = objAbsX;
      endY = size.height;
      textX = objAbsX + 1;
      textY = (startY + endY) / 2;
    }
    textAnchor = "start";
  }

  // Create the line
  const line = makeElement("line");
  line.setAttribute("x1", `${startX}`);
  line.setAttribute("y1", `${startY}`);
  line.setAttribute("x2", `${endX}`);
  line.setAttribute("y2", `${endY}`);
  applyAttributes(line, guideConfig.line.svg_properties);
  line.setAttribute("marker-end", "url(#arrowhead)");

  // Create the distance text
  const text = makeElement("text");
  text.setAttribute("x", `${textX}`);
  text.setAttribute("y", `${textY}`);
  applyAttributes(text, guideConfig.text.svg_properties);
  text.textContent = distance.toFixed(1) + '"';

  group.appendChild(line);
  group.appendChild(text);

  return group;
}

function makeDeploymentZone(
  config: FullConfig,
  attackerDefender: "attacker" | "defender"
): SVGElement {
  const playerConfig = config.deployment[attackerDefender];
  const colorConfig = config.base.deployment[attackerDefender];
  const dz = makeElement("polygon");
  const coordinateStr = playerConfig.deployment_zone
    .map((coords) => getCoordinates(config, coords))
    .join(" ");
  dz.setAttribute("points", coordinateStr);
  dz.setAttribute("fill", "#" + colorConfig.svg_properties.fill);
  dz.setAttribute("stroke", "#" + colorConfig.svg_properties.stroke);
  dz.setAttribute("stroke-width", "0.4");
  if (playerConfig.mask_center) {
    dz.setAttribute("mask", "url(#centerMask)");
  }
  return dz;
}

export function injectMissionCard(rootElement: SVGElement, config: FullConfig) {
  const missionCard = makeMissionCard(config);
  rootElement.appendChild(missionCard);
}

/**
 * Creates a 1x1 grid overlay for the battlefield
 */
function makeGrid(config: FullConfig): SVGElement | null {
  if (config?.base?.grid?.draw !== true) {
    console.debug(`grid not drawn ${config?.base?.grid.draw}`);
    return null;
  }

  const group = makeElement("g");
  applyAttributes(group, config.base.grid.svg_properties);

  const size = config.base.size;
  const gridConfig = config.base.grid;

  // Create vertical lines
  for (let x = 1; x < size.width; x++) {
    const line = makeElement("line");
    line.setAttribute("x1", `${x}`);
    line.setAttribute("y1", "0");
    line.setAttribute("x2", `${x}`);
    line.setAttribute("y2", `${size.height}`);
    line.setAttribute("id", `grid-vertical-${x}`);
    group.appendChild(line);
  }

  // Create horizontal lines
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

export function makeMissionCard(config: FullConfig) {
  const svg = makeElement("svg");
  svg.setAttribute(
    "viewBox",
    `0 0 ${config.base.size.width} ${config.base.size.height}`
  );
  if (config.base.background.fill) {
    svg.setAttribute("fill", `${config.base.background.fill}`);
  }

  injectDefs(svg, config);

  svg.appendChild(makeDeploymentZone(config, "attacker"));
  svg.appendChild(makeDeploymentZone(config, "defender"));

  // Add grid first so it appears behind other elements
  const grid = makeGrid(config);
  if (grid) {
    svg.appendChild(grid);
  }

  svg.appendChild(makeObjectives(config));
  svg.appendChild(makeHalfwayLines(config));

  if (config.terrain) {
    svg.appendChild(makeBuildings(config));
  }

  return svg;
}
