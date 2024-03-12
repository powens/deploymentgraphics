/**
 * Returns a svg element of type typename
 * @param {string} typeName
 * @returns {SVGElement}
 */
function makeElement(typeName) {
  return document.createElementNS("http://www.w3.org/2000/svg", typeName);
}
