import { makeElement } from "./dom-helpers";

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

/**
 *
 * @param {import("./make-mission-card").FullConfig} config
 * @returns
 */
export function makeBuildings(config) {
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
