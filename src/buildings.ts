import { FullConfig, TerrainLayoutItem, TerrainTemplate } from "./types";
import { applyAttributes, makeElement } from "./dom-helpers";
import { processBuildingCoordinates } from "./coordinates";

function makeBuilding(config: FullConfig, building: TerrainLayoutItem) {}

export function makeBuildings(config: FullConfig): SVGElement {
  const buildingGroup = makeElement("g");
  buildingGroup.setAttribute("id", "buildings");
  const layoutName = config.terrain.layout_name;
  const layout = config.terrain.layout[layoutName];

  if (!layout) {
    console.warn(`No layout found for layout name: ${layoutName}`);
    return buildingGroup;
  }

  let counter = 0;
  for (const building of layout.buildings) {
    const processedCoords = processBuildingCoordinates(building.coords);

    // Orignal position
    const buildingElement = makeElement("use");
    buildingElement.setAttribute("href", `#template-${building.type}`);
    buildingElement.setAttribute(
      "transform",
      `translate(${processedCoords.position[0]} ${processedCoords.position[1]}) rotate(${processedCoords.rotation})`
    );
    buildingElement.setAttribute("id", `building-${counter}`);
    applyAttributes(buildingElement, config.base.building.svg_properties);
    buildingGroup.appendChild(buildingElement);

    //Mirrored position
    const mirroredCoords = [
      config.base.size.width - processedCoords.position[0],
      config.base.size.height - processedCoords.position[1],
    ];
    const mirroredRotation = (processedCoords.rotation + 180) % 360;

    const mirroredBuildingElement = makeElement("use");
    mirroredBuildingElement.setAttribute("href", `#template-${building.type}`);
    mirroredBuildingElement.setAttribute(
      "transform",
      `translate(${mirroredCoords[0]} ${mirroredCoords[1]}) rotate(${mirroredRotation})`
    );
    mirroredBuildingElement.setAttribute("id", `building-${counter}-mirrored`);
    applyAttributes(
      mirroredBuildingElement,
      config.base.building.svg_properties
    );
    buildingGroup.appendChild(mirroredBuildingElement);
    counter++;
  }

  return buildingGroup;
}

export function injectTemplateDefs(config: FullConfig, defs: SVGElement) {
  const templates = config.terrain.templates;
  console.debug("Injecting templates", templates);

  for (const templateName in templates) {
    const template = templates[templateName];
    const def = makeBuildingTemplate(config, template);
    def.setAttribute("id", `template-${templateName}`);
    applyAttributes(def, config.base.building.template);
    defs.appendChild(def);
  }
}

function makeBuildingTemplate(config: FullConfig, template: TerrainTemplate) {
  const templateRect = makeElement("rect");
  templateRect.setAttribute("x", "0");
  templateRect.setAttribute("y", "0");
  templateRect.setAttribute("width", template.template.width.toString());
  templateRect.setAttribute("height", template.template.height.toString());
  applyAttributes(templateRect, config.base.building.svg_properties);
  return templateRect;
}
