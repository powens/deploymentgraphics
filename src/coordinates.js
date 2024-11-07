/**
 * Returns the anchor origin point based on the anchor value
 * @param {BaseConfig} config
 * @param {string} anchor
 * @returns {[number, number]}
 */
function getAnchor(config, anchor) {
  switch (anchor) {
    case "TOP_LEFT":
      return [0, 0];
    case "TOP_CENTER":
      return [config.base.size.width / 2, 0];
    case "TOP_RIGHT":
      return [config.base.size.width, 0];
    case "BOTTOM_LEFT":
      return [0, config.base.size.height];
    case "BOTTOM_RIGHT":
      return [config.base.size.width, config.base.size.height];
    case "BOTTOM_CENTER":
      return [config.base.size.width / 2, config.base.size.height];
    case "MIDDLE":
      return [config.base.size.width / 2, config.base.size.height / 2];
    case "MIDDLE_LEFT":
      return [0, config.base.size.height / 2];
    case "MIDDLE_RIGHT":
      return [config.base.size.width, config.base.size.height / 2];
    case "CENTER":
      return [config.base.size.width / 2, config.base.size.height / 2];
    default:
      return [config.base.size.width / 2, config.base.size.height / 2];
  }
}

/**
 * Returns the coordinates of an element based on the anchor point
 * @param {import("./make-mission-card").FullConfig} config
 * @param {[number, number]} coordinate
 * @param {string} anchor
 * @returns {[number, number]}
 */
export function getCoordinates(config, coordinate, anchor = "CENTER") {
  const origin = getAnchor(config, anchor);
  return [coordinate[0] + origin[0], coordinate[1] + origin[1]];
}
