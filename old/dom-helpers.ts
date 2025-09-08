/**
 * Returns a svg element of type typename
 */
export function makeElement(typeName: string): SVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", typeName);
}

/**
 * Applies a set of attributes to an element
 */
export function applyAttributes(
  element: SVGElement,
  attrs: Record<string, string>
): void {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key.replaceAll("_", "-"), value);
  }
}
