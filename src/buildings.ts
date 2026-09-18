import { applyAttributes } from "./dom-helpers.js";
import type { SvgDocument, SvgNode } from "./svg-backend.js";
import {
  toPoint,
  type BuildingPlacement,
  type CanvasSize,
  type Template,
} from "./building-coordinates.js";
import { placeBuildings, placedTransform } from "./placement.js";
import type { SVGProperties } from "./types.js";

/**
 * Appends one shape definition per template into `defs`: a `<polygon>` for a
 * polygon, a `<rect>` for a rectangle. Each carries the id `template-<name>` so a building `<use>`
 * can reference it.
 */
export function injectTemplateDefs(
  doc: SvgDocument,
  templates: Record<string, Template>,
  defs: SvgNode,
  styleFor?: (name: string) => SVGProperties | undefined,
): void {
  for (const [name, template] of Object.entries(templates)) {
    let shape: SvgNode;
    if ("points" in template) {
      shape = doc.createElement("polygon");
      shape.setAttribute(
        "points",
        template.points
          .map((p) => toPoint(p, `template ${name}: points`))
          .map((p) => `${p.x},${p.y}`)
          .join(" "),
      );
    } else {
      shape = doc.createElement("rect");
      shape.setAttribute("x", "0");
      shape.setAttribute("y", "0");
      shape.setAttribute("width", `${template.width}`);
      shape.setAttribute("height", `${template.height}`);
    }
    shape.setAttribute("id", `template-${name}`);
    const props = styleFor?.(name);
    if (props) {
      applyAttributes(shape, props);
    }
    defs.appendChild(shape);
  }
}

/** Builds a <g> of <use> elements, one per resolved (and mirrored) building. */
export function makeBuildings(
  doc: SvgDocument,
  placements: BuildingPlacement[],
  templates: Record<string, Template>,
  canvas: CanvasSize,
  styleFor?: (name: string) => SVGProperties | undefined,
): SvgNode {
  const group = doc.createElement("g");
  group.setAttribute("id", "buildings");

  let counter = 0;
  for (const placed of placeBuildings(placements, templates, canvas)) {
    const use = doc.createElement("use");
    use.setAttribute("href", `#template-${placed.name}`);
    use.setAttribute("transform", placedTransform(placed));
    use.setAttribute("id", `building-${counter}`);
    const props = styleFor?.(placed.name);
    if (props) {
      applyAttributes(use, props);
    }
    group.appendChild(use);
    counter++;
  }
  return group;
}
