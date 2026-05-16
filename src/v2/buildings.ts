import { makeElement } from "./dom-helpers";
import {
  resolveBuilding,
  type BuildingPlacement,
  type CanvasSize,
  type RectTemplate,
} from "./building-coordinates";

/** Appends one <rect> template definition per template into `defs`. */
export function injectTemplateDefs(
  templates: Record<string, RectTemplate>,
  defs: SVGElement,
): void {
  for (const [name, template] of Object.entries(templates)) {
    const rect = makeElement("rect");
    rect.setAttribute("id", `template-${name}`);
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", `${template.width}`);
    rect.setAttribute("height", `${template.height}`);
    defs.appendChild(rect);
  }
}

/** Builds a <g> of <use> elements, one per resolved (and mirrored) building. */
export function makeBuildings(
  placements: BuildingPlacement[],
  templates: Record<string, RectTemplate>,
  canvas: CanvasSize,
): SVGElement {
  const group = makeElement("g");
  group.setAttribute("id", "buildings");

  let counter = 0;
  for (const placement of placements) {
    for (const resolved of resolveBuilding(placement, templates, canvas)) {
      const use = makeElement("use");
      use.setAttribute("href", `#template-${resolved.templateName}`);
      use.setAttribute(
        "transform",
        `translate(${resolved.translate[0]} ${resolved.translate[1]}) ` +
          `rotate(${resolved.rotation})`,
      );
      use.setAttribute("id", `building-${counter}`);
      group.appendChild(use);
      counter++;
    }
  }
  return group;
}
