/**
 * Building Coordinate Systems
 * ==========================
 *
 * This module supports multiple coordinate systems for building placement:
 *
 * 1. Two-Corner System (Recommended):
 *    Format: [[x1, y1], [x2, y2]]
 *    Example: [[10, 20], [16, 26]]
 *    - The building is positioned at the first corner
 *    - The rotation is calculated based on the angle between the two corners
 *    - Automatic rotation calculation eliminates the need for manual rotation values
 *
 * 2. Legacy Single Point System:
 *    Format: [x, y]
 *    Example: [10, 20]
 *    - Building positioned at the specified coordinates
 *    - No rotation (defaults to 0 degrees)
 *
 * 3. Legacy Anchor System (deprecated but supported):
 *    Format: Complex object with anchors and map_coords
 *    - Kept for backward compatibility only
 */

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

/**
 * Calculates the angle between two points in degrees
 * @param {[number, number]} point1 - First point [x, y]
 * @param {[number, number]} point2 - Second point [x, y]
 * @returns {number} Angle in degrees
 */
export function calculateAngle(point1, point2) {
  const dx = point2[0] - point1[0];
  const dy = point2[1] - point1[1];
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Processes building coordinates from the two-corner system
 * @param {import("./make-mission-card").FullConfig} config
 * @param {Object} coordsData - The coords object from terrain config
 * @returns {{position: [number, number], rotation: number}}
 */
export function processBuildingCoords(config, coordsData) {
  if (Array.isArray(coordsData)) {
    // Check if this is the new two-corner system: [[x1, y1], [x2, y2]]
    if (
      coordsData.length === 2 &&
      Array.isArray(coordsData[0]) &&
      Array.isArray(coordsData[1])
    ) {
      const corner1 = coordsData[0];
      const corner2 = coordsData[1];

      // Calculate rotation angle between the two corners
      const rotation = calculateAngle(corner1, corner2);

      // Use the first corner as the building position
      return {
        position: corner1,
        rotation: rotation,
      };
    }

    // Old system: [x, y] coordinates
    if (coordsData.length === 2 && typeof coordsData[0] === "number") {
      return {
        position: coordsData,
        rotation: 0,
      };
    }
  }

  // Legacy system with anchors (kept for backward compatibility)
  if (
    coordsData &&
    coordsData.length === 2 &&
    coordsData[0].anchor &&
    coordsData[0].map_coords
  ) {
    const point1 = coordsData[0];
    const point2 = coordsData[1];

    // Convert map coordinates to absolute positions
    const pos1 = getCoordinates(
      config,
      point1.map_coords.slice(0, 2),
      point1.map_coords[2]
    );
    const pos2 = getCoordinates(
      config,
      point2.map_coords.slice(0, 2),
      point2.map_coords[2]
    );

    // Calculate rotation angle
    const rotation = calculateAngle(point1.anchor, point2.anchor);

    // Use first point's map coordinates as the building position
    return {
      position: pos1,
      rotation: rotation,
    };
  }

  // Fallback for unknown format
  console.warn("Unknown coordinate format:", coordsData);
  return {
    position: [0, 0],
    rotation: 0,
  };
}

/**
 * Creates two-corner coordinates for a building
 * @param {[number, number]} corner1 - First corner [x, y]
 * @param {[number, number]} corner2 - Second corner [x, y]
 * @returns {[[number, number], [number, number]]}
 */
export function createTwoCornerCoords(corner1, corner2) {
  return [corner1, corner2];
}

/**
 * Calculates the center point between two corners
 * @param {[number, number]} corner1 - First corner [x, y]
 * @param {[number, number]} corner2 - Second corner [x, y]
 * @returns {[number, number]} Center point [x, y]
 */
export function getBuildingCenter(corner1, corner2) {
  return [(corner1[0] + corner2[0]) / 2, (corner1[1] + corner2[1]) / 2];
}

/**
 * Calculates the distance between two corners
 * @param {[number, number]} corner1 - First corner [x, y]
 * @param {[number, number]} corner2 - Second corner [x, y]
 * @returns {number} Distance between corners
 */
export function getBuildingLength(corner1, corner2) {
  const dx = corner2[0] - corner1[0];
  const dy = corner2[1] - corner1[1];
  return Math.sqrt(dx * dx + dy * dy);
}
