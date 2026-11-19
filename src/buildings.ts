import { applyAttributes } from "./dom-helpers.js";
import { useLayer, type LayerRow } from "./layer.js";
import type { SvgNode } from "./svg-backend.js";
import {
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

/**
 * The buildings layer: one `<use>` per resolved (and mirrored) building, each
 * referencing its template's def. Always drawn (no layout gives an empty
 * `<g id="buildings">`), and the defs are the board's whole template set, one
 * `<polygon>` or `<rect>` per template, whether or not this layout uses it.
 */
export function buildingLayer(
  placements: BuildingPlacement[],
  templates: Record<string, Template>,
  canvas: CanvasSize,
  theme: Theme,
): LayerRow {
  return useLayer({
    id: "buildings",
    useId: "building",
    draws: true,
    uses: placeBuildings(placements, templates, canvas),
    defOf: (placed) => placed.name,
    defs: Object.keys(templates),
    defId: (name) => `template-${name}`,
    def: (doc, name, id) => {
      const template = templates[name];
      let shape: SvgNode;
      if ("points" in template) {
        shape = doc.createElement("polygon");
        shape.setAttribute(
          "points",
          template.points.map((p) => `${p.x},${p.y}`)
            .join(" "),
        );
      } else {
        shape = doc.createElement("rect");
        shape.setAttribute("x", "0");
        shape.setAttribute("y", "0");
        shape.setAttribute("width", `${template.width}`);
        shape.setAttribute("height", `${template.height}`);
      }
      shape.setAttribute("id", id);
      applyAttributes(shape, styleFor(theme, name));
      return shape;
    },
    transform: placedTransform,
    styleUse: (el, placed) => applyAttributes(el, styleFor(theme, placed.name)),
  });
}
