import { applyAttributes, makeElement } from "./dom-helpers";
import {
  resolveBuilding,
  type BuildingPlacement,
  type CanvasSize,
  type Template,
} from "./building-coordinates";
import type { SVGProperties } from "./types";

/**
 * Appends one shape definition per template into `defs`: a `<polygon>` for
 * a polygon template, a `<rect>` for a rectangle. Each carries the id
 * `template-<name>` so a building `<use>` can reference it.
 */
export function injectTemplateDefs(
  templates: Record<string, Template>,
  defs: SVGElement,
  svgProperties?: SVGProperties,
): void {
  for (const [name, template] of Object.entries(templates)) {
    let shape: SVGElement;
    if ("points" in template) {
      shape = makeElement("polygon");
      shape.setAttribute(
        "points",
        template.points.map((p) => `${p[0]},${p[1]}`).join(" "),
      );
    } else {
      shape = makeElement("rect");
      shape.setAttribute("x", "0");
      shape.setAttribute("y", "0");
      shape.setAttribute("width", `${template.width}`);
      shape.setAttribute("height", `${template.height}`);
    }
    shape.setAttribute("id", `template-${name}`);
    if (svgProperties) {
      applyAttributes(shape, svgProperties);
    }
    defs.appendChild(shape);
  }
}

/** Builds a <g> of <use> elements, one per resolved (and mirrored) building. */
export function makeBuildings(
  placements: BuildingPlacement[],
  templates: Record<string, Template>,
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
