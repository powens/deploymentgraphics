import { makeBuildings } from "./buildings";
import { makeElement, applyAttributes } from "./dom-helpers";
import { getCoordinates } from "./coordinates";

/**
 * @typedef {[number, number]} Coordinate
 * @typedef {[number, number, string]} AnchoredCoordinate
 * @typedef {"short" | "long"} BattlefieldEdge
 *
 *
 * @typedef {Object} ObjectiveConfig
 *
 * @typedef {Object} AttackerDefender
 * @property {string} fill - Fill color
 * @property {string} stroke - Stroke color
 *
 *
 * @typedef {Object} BuildingConfig
 * @property {string} opacity - Opacity of the building
 * @property {Object} template - Configuration for the building template
 * @property {string} template.fill - Fill color for the building template
 * @property {string} template.stroke - Stroke color for the building template
 * @property {string} template.stroke_dasharray - Stroke dasharray for the building template
 * @property {string} template.stroke_width - Stroke width for the building template
 * @property {Object} structure - Configuration for the building structure
 * @property {string} structure.fill - Fill color for the building structure
 * @property {string} structure.stroke - Stroke color for the building structure
 * @property {string} structure.stroke_width - Stroke width for the building structure
 *
 * @typedef {Object} GridConfig
 * @property {boolean} draw - Whether to draw the grid
 * @property {string} opacity - Opacity of the grid
 * @property {string} stroke - Stroke color for the grid lines
 * @property {string} stroke_width - Stroke width for the grid lines
 * @property {string} stroke_dasharray - Stroke dasharray for the grid lines
 *
 *
 * @typedef {Object} BaseConfig
 * @property {Object} size - Size of the battlefield
 * @property {number} size.width - Width of the battlefield
 * @property {number} size.height - Height of the battlefield
 * @property {Object} guide_line - SVG Attributes for configuration for the half-way lines
 * @property {ObjectiveConfig} objective - Configuration for the objective markers
 * @property {AttackerDefender} attacker - Configuration for the attacker
 * @property {AttackerDefender} defender - Confiuration for the defender
 * @property {BuildingConfig} building - Configuration for the buildings
 * @property {GridConfig} grid - Configuration for the grid
 *
 *
 * @typedef {Object} AttackerDefender
 * @property {Coordinate[]} deployment_zone - Deployment zone coordinates
 *
 * @typedef {Object} MissionConfig
 * @property {string} name - Name of mthe mission
 * @property {BattlefieldEdge} home_edge - Which edge is the home edge
 * @property {AttackerDefender} attacker - Attacker Config
 * @property {AttackerDefender} defender - Defender Config
 * @property {Coordinate[]} objectives - Objective coordinates
 *
 * @typedef {Object} TerrainBuildings
 * @property {Object} template - Configuration for the building template
 * @property {number} template.width - Width of the building template
 * @property {number} template.height - Height of the building template
 *
 * @typedef {Object} TerrainCoordinate
 * @typedef {number[]} anchor - Anchor point for the building
 * @typedef {Coordinate} map_coords - Coordinates on the map for the building
 *
 * @typedef {Object} TerrainCoordinates
 * @typedef {TerrainCoordinate[]} coords - Array of two coordinates to anchor the building and compute rotation angle
 *
 * @typedef {Object} TerrainLayout
 * @property {string} type - Type of building. Reference to key in terrain.buildings
 * @property {TerrainCoordinates} coords - Coordinates for the building
 *
 * @typedef {Object} TerrainConfig
 * @property {TerrainBuildings} buildings - Configuration for the buildings
 * @property {Object} layout - Different layouts
 *
 * @typedef {Object} FullConfig
 * @property {BaseConfig} base - Base configuration
 * @property {MissionConfig} mission - Mission configuration
 * @property {Object} terrain - Terrain configuration
 */

/**
 * Creates an objective marker SVG element
 * @param {FullConfig} config
 * @returns {SVGElement}
 */
function makeObjectiveMarker(config) {
  const objConfig = config.base.objective;
  const objGroup = makeElement("g");
  objGroup.setAttribute("id", "objMarker");

  const objMarker = makeElement("circle");
  objMarker.setAttribute("cx", "0");
  objMarker.setAttribute("cy", "0");
  applyAttributes(objMarker, objConfig.real);

  const objRadius = makeElement("circle");
  objRadius.setAttribute("cx", "0");
  objRadius.setAttribute("cy", "0");
  objRadius.setAttribute("r", objConfig.influence.radius + objConfig.real.r);
  applyAttributes(objRadius, objConfig.influence);

  objGroup.appendChild(objRadius);
  objGroup.appendChild(objMarker);

  return objGroup;
}

/**
 * Injects the center mask into an SVGElement
 * @param {SVGElement} svg
 * @param {FullConfig} config
 */
function injectCenterMask(svg, config) {
  const centerMask = makeElement("mask");
  centerMask.setAttribute("id", "centerMask");

  const fullRect = makeElement("rect");
  fullRect.setAttribute("x", "0");
  fullRect.setAttribute("y", "0");
  fullRect.setAttribute("width", config.base.size.width);
  fullRect.setAttribute("height", config.base.size.height);
  fullRect.setAttribute("fill", "white");
  centerMask.appendChild(fullRect);

  const centerCircle = makeElement("circle");
  centerCircle.setAttribute("cx", config.base.size.width / 2);
  centerCircle.setAttribute("cy", config.base.size.height / 2);
  centerCircle.setAttribute("r", "9");
  centerCircle.setAttribute("fill", "black");
  centerMask.appendChild(centerCircle);
  svg.appendChild(centerMask);
}

/**
 * Inject defs into an SVGElement
 * @param {SVGElement} svg
 * @param {FullConfig} config
 */
function injectDefs(svg, config) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  const objMarker = makeObjectiveMarker(config);
  defs.appendChild(objMarker);

  // Add arrow marker for measurement guides
  const arrowMarker = makeArrowMarker(config);
  defs.appendChild(arrowMarker);

  injectCenterMask(svg, config);
}

/**
 * Makes the half-way lines for the mission
 * @param {FullConfig} config
 * @returns {SVGElement} Group element
 */
function makeDeliniators(config) {
  const group = makeElement("g");

  const guideConfig = config.base.guide_line;
  const vertHalfLine = makeElement("line");
  vertHalfLine.setAttribute("x1", config.base.size.width / 2);
  vertHalfLine.setAttribute("y1", "0");
  vertHalfLine.setAttribute("x2", config.base.size.width / 2);
  vertHalfLine.setAttribute("y1", config.base.size.height);
  applyAttributes(vertHalfLine, guideConfig);
  group.appendChild(vertHalfLine);

  const horizHalfLine = makeElement("line");
  horizHalfLine.setAttribute("x1", "0");
  horizHalfLine.setAttribute("y1", config.base.size.height / 2);
  horizHalfLine.setAttribute("x2", config.base.size.width);
  horizHalfLine.setAttribute("y2", config.base.size.height / 2);
  applyAttributes(horizHalfLine, guideConfig);
  group.appendChild(horizHalfLine);

  return group;
}

/**
 * Returns true if the passed in objective is the center one
 * @param {Coordinate} coordinates
 * @returns {boolean}
 */
function isCenterObjective(coordinates) {
  return coordinates[0] === 0 && coordinates[1] === 0;
}

function isTheRitualObjective(coordinates) {
  if (coordinates.length === 3 && coordinates[2] === "ritual") {
    return true;
  }
  return coordinates[0] === 0 && coordinates[1] === 0;
}

function getHiddenSuppliesCoords() {
  // Angle is 36.254deg
  // a = 3.5482
  // b = 4.83842
  return [4.8, 3.5];
}

/**
 * Creates an arrow marker definition for measurement arrows
 * @param {FullConfig} config
 * @returns {SVGElement}
 */
function makeArrowMarker(config) {
  const marker = makeElement("marker");
  marker.setAttribute("id", "arrowhead");
  marker.setAttribute("markerWidth", "10");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "3.5");
  marker.setAttribute("orient", "auto");

  const polygon = makeElement("polygon");
  polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
  polygon.setAttribute("fill", config.base.objective.guides.stroke);

  marker.appendChild(polygon);
  return marker;
}

/**
 * Calculates the distance to the nearest board edge and direction
 * @param {Coordinate} objCoord - Object coordinate relative to center
 * @param {FullConfig} config
 * @returns {{distance: number, direction: string, edge: string}}
 */
function calculateDistanceToNearestEdge(objCoord, config) {
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

/**
 * Creates a measurement arrow from objective to nearest edge
 * @param {Coordinate} objCoord - Objective coordinate
 * @param {FullConfig} config
 * @param {"horizontal" | "vertical"} type
 * @returns {SVGElement}
 */
function makeMeasurementArrow(objCoord, config, type) {
  if (config?.base?.objective?.guides?.draw !== true) {
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
  line.setAttribute("x1", startX);
  line.setAttribute("y1", startY);
  line.setAttribute("x2", endX);
  line.setAttribute("y2", endY);
  line.setAttribute("stroke", guideConfig.stroke);
  line.setAttribute("stroke-width", guideConfig.stroke_width);
  line.setAttribute("stroke-dasharray", "2 2");
  line.setAttribute("marker-end", "url(#arrowhead)");

  // Create the distance text
  const text = makeElement("text");
  text.setAttribute("x", textX);
  text.setAttribute("y", textY);
  text.setAttribute("font-size", "2");
  text.setAttribute("fill", guideConfig.stroke);
  text.setAttribute("text-anchor", textAnchor);
  text.setAttribute("dominant-baseline", "middle");
  text.textContent = distance.toFixed(1) + '"';

  group.appendChild(line);
  group.appendChild(text);

  return group;
}

function makeObjectives(config) {
  const objectiveGroup = makeElement("g");
  const size = config.base.size;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;

  const objectives = config?.mission?.objectives ?? [];

  for (let coordinates of objectives) {
    if (isCenterObjective(coordinates) && config?.mission?.hidden_supplies) {
      const hiddenSupplesCoords = getHiddenSuppliesCoords();
      const o1 = makeElement("use");
      o1.setAttribute("x", halfWidth - hiddenSupplesCoords[0]);
      o1.setAttribute("y", halfHeight - hiddenSupplesCoords[1]);
      o1.setAttribute("href", "#objMarker");

      const o2 = makeElement("use");
      o2.setAttribute("x", halfWidth + hiddenSupplesCoords[0]);
      o2.setAttribute("y", halfHeight + hiddenSupplesCoords[1]);
      o2.setAttribute("href", "#objMarker");
      objectiveGroup.appendChild(o1);
      objectiveGroup.appendChild(o2);

      // Add measurement arrows for hidden supplies objectives
      if (config?.base?.objective?.guides?.draw) {
        const coord1 = [-hiddenSupplesCoords[0], -hiddenSupplesCoords[1]];
        const coord2 = [hiddenSupplesCoords[0], hiddenSupplesCoords[1]];

        objectiveGroup.appendChild(
          makeMeasurementArrow(coord1, config, "horizontal")
        );
        objectiveGroup.appendChild(
          makeMeasurementArrow(coord1, config, "vertical")
        );
        objectiveGroup.appendChild(
          makeMeasurementArrow(coord2, config, "horizontal")
        );
        objectiveGroup.appendChild(
          makeMeasurementArrow(coord2, config, "vertical")
        );
      }
    } else if (
      !isTheRitualObjective(coordinates) &&
      config.mission?.the_ritual
    ) {
      continue;
    } else {
      const o = makeElement("use");
      const translated = getCoordinates(config, coordinates);
      o.setAttribute("x", translated[0]);
      o.setAttribute("y", translated[1]);
      o.setAttribute("href", "#objMarker");

      // Add measurement arrows for regular objectives
      if (config?.base?.objective?.guides?.draw) {
        objectiveGroup.appendChild(
          makeMeasurementArrow(coordinates, config, "horizontal")
        );
        objectiveGroup.appendChild(
          makeMeasurementArrow(coordinates, config, "vertical")
        );
      }

      objectiveGroup.appendChild(o);
    }
  }

  return objectiveGroup;
}

function makeDeploymentZone(config, attackerDefender) {
  const playerConfig = config.mission[attackerDefender];
  const colorConfig = config.base[attackerDefender];
  const dz = makeElement("polygon");
  const coordinateStr = playerConfig.deployment_zone
    .map((coords) => getCoordinates(config, coords))
    .join(" ");
  dz.setAttribute("points", coordinateStr);
  dz.setAttribute("fill", "#" + colorConfig.fill);
  dz.setAttribute("stroke", "#" + colorConfig.stroke);
  dz.setAttribute("stroke-width", "0.4");
  if (playerConfig.mask_center) {
    dz.setAttribute("mask", "url(#centerMask)");
  }
  return dz;
}

/**
 * Creates a 1x1 grid overlay for the battlefield
 * @param {FullConfig} config
 * @returns {SVGElement}
 */
function makeGrid(config) {
  if (config?.base?.grid?.draw !== true) {
    return null;
  }

  const group = makeElement("g");
  group.setAttribute("opacity", config.base.grid.opacity);

  const size = config.base.size;
  const gridConfig = config.base.grid;

  // Create vertical lines
  for (let x = 1; x < size.width; x++) {
    const line = makeElement("line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", 0);
    line.setAttribute("x2", x);
    line.setAttribute("y2", size.height);
    line.setAttribute("stroke", gridConfig.stroke);
    line.setAttribute("stroke-width", gridConfig.stroke_width);
    line.setAttribute("stroke-dasharray", gridConfig.stroke_dasharray);
    group.appendChild(line);
  }

  // Create horizontal lines
  for (let y = 1; y < size.height; y++) {
    const line = makeElement("line");
    line.setAttribute("x1", 0);
    line.setAttribute("y1", y);
    line.setAttribute("x2", size.width);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", gridConfig.stroke);
    line.setAttribute("stroke-width", gridConfig.stroke_width);
    line.setAttribute("stroke-dasharray", gridConfig.stroke_dasharray);
    group.appendChild(line);
  }

  return group;
}

export function injectMissionCard(rootElement, config) {
  const missionCard = makeMissionCard(config);
  rootElement.appendChild(missionCard);
}

export function makeMissionCard(config) {
  const svg = makeElement("svg");
  svg.setAttribute("width", "600px");
  svg.setAttribute("height", "440px");
  svg.setAttribute(
    "viewBox",
    `0 0 ${config.base.size.width} ${config.base.size.height}`
  );
  if (config.base.fill) {
    svg.setAttribute("fill", config.base.fill);
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
  svg.appendChild(makeDeliniators(config));

  if (config.terrain) {
    svg.appendChild(makeBuildings(config));
  }

  return svg;
}
