import { applyAttributes, makeElement } from "./dom-helpers";
import {
  resolveBuilding,
  type BuildingPlacement,
  type CanvasSize,
  type RectTemplate,
} from "./building-coordinates";
import type { SVGProperties } from "./types";

/** Appends one <rect> template definition per template into `defs`. */
export function injectTemplateDefs(
  templates: Record<string, RectTemplate>,
  defs: SVGElement,
  svgProperties?: SVGProperties,
): void {
  for (const [name, template] of Object.entries(templates)) {
    const rect = makeElement("rect");
    rect.setAttribute("id", `template-${name}`);
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", `${template.width}`);
    rect.setAttribute("height", `${template.height}`);
    if (svgProperties) {
      applyAttributes(rect, svgProperties);
    }
    defs.appendChild(rect);
  }
}

/** Builds a <g> of <use> elements, one per resolved (and mirrored) building. */
export function makeBuildings(
  placements: BuildingPlacement[],
  templates: Record<string, RectTemplate>,
  canvas: CanvasSize,
  svgProperties?: SVGProperties,
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
      if (svgProperties) {
        applyAttributes(use, svgProperties);
      }
      group.appendChild(use);
      counter++;
    }
  }
  return group;
}
