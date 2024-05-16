/**
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
 */

/**
 * Helper function to generate a new SVG element
 * @param {string} typeName
 * @returns {SVGElement}
 */
function makeElement(typeName) {
  return document.createElementNS("http://www.w3.org/2000/svg", typeName);
}

/**
 * Applies a set of attributes to an element
 * @param {SVGElement} element
 * @param {Object.<string, string>} attrs
 */
function applyAttributes(element, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key.replaceAll("_", "-"), value);
  }
}

/**
 * Creates an objective marker SVG element
 * @param {Object} config
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
  objRadius.setAttribute("fill", objConfig.influence.fill);
  objRadius.setAttribute("stroke", objConfig.influence.stroke);

  objGroup.appendChild(objRadius);
  objGroup.appendChild(objMarker);

  return objGroup;
}

/**
 * Inject defs into an SVGElement
 * @param {SVGElement} svg
 * @param {Object} config
 */
function injectDefs(svg, config) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  const objMarker = makeObjectiveMarker(config);
  defs.appendChild(objMarker);

  injectCenterMask(svg, config);
}

/**
 * Injects the center mask into an SVGElement
 * @param {SVGElement} svg
 * @param {Object} config
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
 * Makes the half-way lines for the mission
 * @param {Object} config
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
 * @param {Number[]} coordinates
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
  //   a = 3.5482
  // b = 4.83842
  return [4.8, 3.5];
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
    } else if (
      !isTheRitualObjective(coordinates) &&
      config.mission?.the_ritual
    ) {
      continue;
    } else {
      const o = makeElement("use");
      o.setAttribute("x", coordinates[0] + halfWidth);
      o.setAttribute("y", coordinates[1] + halfHeight);
      o.setAttribute("href", "#objMarker");

      if (config?.main?.objective?.guides?.draw) {
        // TODO: Finish me
      }

      objectiveGroup.appendChild(o);
    }
  }

  return objectiveGroup;
}

function makeDeploymentZone(config, attackerDefender) {
  const playerConfig = config.mission[attackerDefender];
  const halfWidth = config.base.size.width / 2;
  const halfHeight = config.base.size.height / 2;
  const colorConfig = config.base[attackerDefender];
  const dz = makeElement("polygon");
  const coordinateStr = playerConfig.deployment_zone
    .map(([x, y]) => [x + halfWidth, y + halfHeight])
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

export function makeMissionCard(rootElement, config) {
  const svg = makeElement("svg");
  svg.setAttribute("width", "600px");
  svg.setAttribute("height", "440px");
  svg.setAttribute(
    "viewBox",
    `0 0 ${config.base.size.width} ${config.base.size.height}`
  );

  injectDefs(svg, config);

  svg.appendChild(makeDeploymentZone(config, "attacker"));
  svg.appendChild(makeDeploymentZone(config, "defender"));
  svg.appendChild(makeObjectives(config));
  svg.appendChild(makeDeliniators(config));

  if (config.terrain) {
    svg.appendChild(makeBuildings(config));
  }

  rootElement.appendChild(svg);
}

/////////////////
function makeBuildingTemplate(template, config) {
  const templateRect = makeElement("rect");
  templateRect.setAttribute("x", "0");
  templateRect.setAttribute("y", "0");
  templateRect.setAttribute("width", template.width);
  templateRect.setAttribute("height", template.height);
  templateRect.setAttribute("fill", `#${config.base.building.template.fill}`);
  templateRect.setAttribute("stroke", config.base.building.template.stroke);
  templateRect.setAttribute(
    "stroke-dasharray",
    config.base.building.template.stroke_dasharray
  );
  templateRect.setAttribute(
    "stroke-width",
    config.base.building.template.stroke_width
  );

  return templateRect;
}

function makeBuilding(config, building, coords, rotation) {
  const group = makeElement("g");
  group.setAttribute("opacity", config.base.building.opacity);
  group.setAttribute(
    "transform",
    `translate(${coords[0]} ${coords[1]}) rotate(${rotation ?? 0})`
  );
  group.appendChild(makeBuildingTemplate(building.template, config));

  if (config.base.building.render) {
    const structures = building?.structures ?? [];
    for (const structure of structures) {
      switch (structure.type) {
        case "line":
          const obj = makeElement("line");
          obj.setAttribute("x1", structure.start[0]);
          obj.setAttribute("y1", structure.start[1]);
          obj.setAttribute("x2", structure.end[0]);
          obj.setAttribute("y2", structure.end[1]);
          obj.setAttribute("stroke", config.base.building.structure.stroke);
          obj.setAttribute(
            "stroke-width",
            config.base.building.structure.stroke_width
          );
          group.appendChild(obj);
          break;
        case "poly":
          const poly = makeElement("polygon");
          poly.setAttribute("points", structure.points.join(" "));
          poly.setAttribute("fill", `${config.base.building.structure.fill}`);
          group.appendChild(poly);
          break;
      }
    }
  }
  return group;
}

function makeBuildings(config) {
  const layoutName = config.terrain.layoutName;
  const layout = config.terrain.layout[layoutName];
  if (!layout) {
    console.warn(`Could not find layout name ${layoutName}`);
    return;
  }

  const baseBuildings = config.terrain.buildings;
  const superGroup = makeElement("g");
  for (const buildingInstance of layout.buildings) {
    const building = baseBuildings[buildingInstance.type];
    if (!building) {
      console.warn(`Unknown building pointer: ${buildingInstance.type}`);
      continue;
    }

    const group = makeBuilding(
      config,
      building,
      buildingInstance.coords,
      buildingInstance.rotation
    );
    superGroup.appendChild(group);
    if (buildingInstance?.mirror ?? true) {
      const mirriroredCoords = [
        config.base.size.width - buildingInstance.coords[0],
        config.base.size.height - buildingInstance.coords[1],
      ];
      const mirroredRotation = 180 + buildingInstance.rotation;
      const mirroredBuilding = makeBuilding(
        config,
        building,
        mirriroredCoords,
        mirroredRotation
      );
      superGroup.appendChild(mirroredBuilding);
    }
  }
  return superGroup;
}
