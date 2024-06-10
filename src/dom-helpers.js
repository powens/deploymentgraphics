/**
 * Returns a svg element of type typename
 * @param {string} typeName
 * @returns {SVGElement}
 */
export function makeElement(typeName) {
  return document.createElementNS("http://www.w3.org/2000/svg", typeName);
}

/**
 * Applies a set of attributes to an element
 * @param {SVGElement} element
 * @param {Object.<string, string>} attrs
 */
export function applyAttributes(element, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key.replaceAll("_", "-"), value);
  }
}
