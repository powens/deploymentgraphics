import type { SvgNode } from "./svg-backend.js";
import type { SVGProperties } from "./types.js";

/** Applies attributes to an element; `_` in a key becomes `-`. */
export function applyAttributes(element: SvgNode, attrs: SVGProperties): void {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key.replaceAll("_", "-"), `${value}`);
  }
}
