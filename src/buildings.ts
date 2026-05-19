import { applyAttributes, makeElement } from "./dom-helpers.js";
import {
  resolveBuilding,
  type BuildingPlacement,
  type CanvasSize,
  type PathSegment,
  type Point,
  type Template,
} from "./building-coordinates.js";
import type { SVGProperties } from "./types.js";

/**
 * Builds the SVG path `d` data for a closed footprint: a move to `start`,
 * one command per segment (line / quadratic / cubic Bézier), then `Z`.
 */
export function segmentsToPathData(
  start: Point,
  segments: PathSegment[],
): string {
  let d = `M ${start[0]} ${start[1]}`;
  for (const segment of segments) {
    if ("line" in segment) {
      d += ` L ${segment.line[0]} ${segment.line[1]}`;
    } else if ("quad" in segment) {
      const { quad, control } = segment;
      d += ` Q ${control[0]} ${control[1]} ${quad[0]} ${quad[1]}`;
    } else if ("cubic" in segment) {
      const { cubic, controls } = segment;
      d +=
        ` C ${controls[0][0]} ${controls[0][1]} ` +
        `${controls[1][0]} ${controls[1][1]} ${cubic[0]} ${cubic[1]}`;
    } else {
      throw new Error(
        `unrecognized path segment: ${JSON.stringify(segment)}`,
      );
    }
  }
  return `${d} Z`;
}

/**
 * Appends one shape definition per template into `defs`: a `<path>` for a
 * curved path template, a `<polygon>` for a polygon, a `<rect>` for a
 * rectangle. Each carries the id `template-<name>` so a building `<use>`
 * can reference it.
 */
export function injectTemplateDefs(
  templates: Record<string, Template>,
  defs: SVGElement,
  svgProperties?: SVGProperties,
): void {
  for (const [name, template] of Object.entries(templates)) {
    let shape: SVGElement;
    if ("segments" in template) {
      shape = makeElement("path");
      shape.setAttribute(
        "d",
        segmentsToPathData(template.start, template.segments),
      );
    } else if ("points" in template) {
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
