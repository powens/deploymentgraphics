import { BuildingCoordinate, Coordinate, FullConfig } from "./types";

/**
 * Calculates the angle between two points in degrees
 */
export function calculateAngle(point1: Coordinate, point2: Coordinate): number {
  const dx = point2[0] - point1[0];
  const dy = point2[1] - point1[1];
  return Math.atan2(dy, dx) * (180 / Math.PI);
}
/**
 * Returns the anchor origin point based on the anchor value
 */
function getAnchor(config: FullConfig, anchor: string): Coordinate {
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
 */
export function getCoordinates(
  config: FullConfig,
  coordinate: Coordinate,
  anchor = "CENTER"
): Coordinate {
  const origin = getAnchor(config, anchor);
  return [coordinate[0] + origin[0], coordinate[1] + origin[1]];
}

export function processBuildingCoordinates(coordinates: BuildingCoordinate) {
  const [corner1, corner2] = coordinates;
  const angle = calculateAngle(corner1, corner2);
  return {
    position: corner1,
    rotation: angle,
  };
}

export function isCenterObjective(coordinates: Coordinate) {
  return coordinates[0] === 0 && coordinates[1] === 0;
}

export function getHiddenSuppliesCoords() {
  // Angle is 36.254deg
  // a = 3.5482
  // b = 4.83842
  return [4.8, 3.5];
}
