function makeElement(typeName) {
  return document.createElementNS("http://www.w3.org/2000/svg", typeName);
}

function makeObjectiveMarker(config) {
  const objConfig = config.base.objective;
  const objMarker = makeElement("circle");
  objMarker.setAttribute("id", "objMarker");
  objMarker.setAttribute("cx", "0");
  objMarker.setAttribute("cy", "0");
  objMarker.setAttribute("r", objConfig.radius);
  objMarker.setAttribute("fill", objConfig.fill);
  objMarker.setAttribute("stroke", objConfig.stroke);

  return objMarker;
}

function injectDefs(svg, config) {
  const defs = makeElement("defs");
  svg.appendChild(defs);

  const objMarker = makeObjectiveMarker(config);
  defs.appendChild(objMarker);
}

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

function makeDeliniators(config) {
  const group = makeElement("g");

  const guideConfig = config.base.guide_line;
  const vertHalfLine = makeElement("line");
  vertHalfLine.setAttribute("x1", config.base.size.width / 2);
  vertHalfLine.setAttribute("y1", "0");
  vertHalfLine.setAttribute("x2", config.base.size.width / 2);
  vertHalfLine.setAttribute("y1", config.base.size.height);
  vertHalfLine.setAttribute("stroke", guideConfig.stroke);
  vertHalfLine.setAttribute("stroke-dasharray", guideConfig.stroke_dasharray);
  vertHalfLine.setAttribute("stroke-width", guideConfig.stroke_width);
  group.appendChild(vertHalfLine);

  const horizHalfLine = makeElement("line");
  horizHalfLine.setAttribute("x1", "0");
  horizHalfLine.setAttribute("y1", config.base.size.height / 2);
  horizHalfLine.setAttribute("x2", config.base.size.width);
  horizHalfLine.setAttribute("y2", config.base.size.height / 2);
  horizHalfLine.setAttribute("stroke", guideConfig.stroke);
  horizHalfLine.setAttribute("stroke-dasharray", guideConfig.stroke_dasharray);
  horizHalfLine.setAttribute("stroke-width", guideConfig.stroke_width);
  group.appendChild(horizHalfLine);

  return group;
}

function makeObjectives(config) {
  const objectiveGroup = makeElement("g");
  const size = config.base.size;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;

  const objectives = config?.mission?.objectives ?? [];

  for (let coordinates of objectives) {
    const o = makeElement("use");
    o.setAttribute("x", coordinates[0] + halfWidth);
    o.setAttribute("y", coordinates[1] + halfHeight);
    o.setAttribute("href", "#objMarker");

    objectiveGroup.appendChild(o);
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

function makeMissionCard(rootElement, config) {
  const svg = makeElement("svg");
  svg.setAttribute("width", "440px");
  svg.setAttribute("height", "600px");
  svg.setAttribute(
    "viewBox",
    `0 0 ${config.base.size.width} ${config.base.size.height}`
  );

  injectDefs(svg, config);
  injectCenterMask(svg, config);

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

    const group = makeElement("g");
    group.setAttribute(
      "transform",
      `translate(${buildingInstance.coords[0]} ${buildingInstance.coords[1]})`
    );
    group.appendChild(makeBuildingTemplate(building.template, config));

    const structures = building.structures;
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

    superGroup.appendChild(group);
  }
  return superGroup;
}
