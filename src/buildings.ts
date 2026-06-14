import { applyAttributes, makeElement } from "./dom-helpers.js";
import {
  resolveBuilding,
  toPoint,
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
  const s = toPoint(start, "path start");
  let d = `M ${s.x} ${s.y}`;
  for (const segment of segments) {
    if ("line" in segment) {
      const p = toPoint(segment.line, "path line");
      d += ` L ${p.x} ${p.y}`;
    } else if ("quad" in segment) {
      const quad = toPoint(segment.quad, "path quad");
      const control = toPoint(segment.control, "path quad control");
      d += ` Q ${control.x} ${control.y} ${quad.x} ${quad.y}`;
    } else if ("cubic" in segment) {
      const cubic = toPoint(segment.cubic, "path cubic");
      const c0 = toPoint(segment.controls[0], "path cubic control 0");
      const c1 = toPoint(segment.controls[1], "path cubic control 1");
      d += ` C ${c0.x} ${c0.y} ${c1.x} ${c1.y} ${cubic.x} ${cubic.y}`;
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
  styleFor?: (name: string) => SVGProperties | undefined,
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
        template.points
          .map((p) => toPoint(p, `template ${name}: points`))
          .map((p) => `${p.x},${p.y}`)
          .join(" "),
      );
    } else {
      shape = makeElement("rect");
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
  placements: BuildingPlacement[],
  templates: Record<string, Template>,
  canvas: CanvasSize,
  styleFor?: (name: string) => SVGProperties | undefined,
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
        `translate(${resolved.translate.x} ${resolved.translate.y}) ` +
          `rotate(${resolved.rotation})`,
      );
      use.setAttribute("id", `building-${counter}`);
      const props = styleFor?.(resolved.templateName);
      if (props) {
        applyAttributes(use, props);
      }
      group.appendChild(use);
      counter++;
    }
  }
  return group;
}
