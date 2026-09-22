import { applyAttributes } from "./dom-helpers.js";
import type { SvgDocument, SvgNode } from "./svg-backend.js";
import {
  toPoint,
  type BuildingPlacement,
  type CanvasSize,
  type Template,
} from "./building-coordinates.js";
import { placeBuildings, placedTransform } from "./placement.js";
import type { Theme } from "./theme.js";
import type { SVGProperties } from "./types.js";

// Group props, overridden by the template's own entry (or `default`). Used for
// both the defs and the `<use>`s so they cannot diverge.
const styleFor = (theme: Theme, name: string): SVGProperties => ({
  ...theme.building.group,
  ...(theme.building.template[name] ?? theme.building.template.default),
});

/** Appends a `<polygon>` or `<rect>` per template to `defs`, id `template-<name>`. */
export function injectTemplateDefs(
  doc: SvgDocument,
  templates: Record<string, Template>,
  defs: SvgNode,
  theme: Theme,
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
    applyAttributes(shape, styleFor(theme, name));
    defs.appendChild(shape);
  }
}

/** Builds a <g> of <use> elements, one per resolved (and mirrored) building. */
export function makeBuildings(
  doc: SvgDocument,
  placements: BuildingPlacement[],
  templates: Record<string, Template>,
  canvas: CanvasSize,
  theme: Theme,
): SvgNode {
  const group = doc.createElement("g");
  group.setAttribute("id", "buildings");

  let counter = 0;
  for (const placed of placeBuildings(placements, templates, canvas)) {
    const use = doc.createElement("use");
    use.setAttribute("href", `#template-${placed.name}`);
    use.setAttribute("transform", placedTransform(placed));
    use.setAttribute("id", `building-${counter}`);
    applyAttributes(use, styleFor(theme, placed.name));
    group.appendChild(use);
    counter++;
  }
  return group;
}
