import type { AnchorLocation, Coordinate, FullConfig } from "./types";

/** Absolute position of a named canvas corner. */
export function getAnchor(
  config: FullConfig,
  anchor: AnchorLocation,
): Coordinate {
  switch (anchor) {
    case "TOP_LEFT":
      return [0, 0];
    case "TOP_RIGHT":
      return [config.base.size.width, 0];
    case "BOTTOM_LEFT":
      return [0, config.base.size.height];
    case "BOTTOM_RIGHT":
      return [config.base.size.width, config.base.size.height];
    default:
      return [0, 0];
  }
}

/** Translates a coordinate by the origin of the named anchor (default TL). */
export function getCoordinates(
  config: FullConfig,
  coordinate: Coordinate,
  anchor: AnchorLocation = "TOP_LEFT",
): Coordinate {
  const origin = getAnchor(config, anchor);
  return [coordinate[0] + origin[0], coordinate[1] + origin[1]];
}

/** True when an objective sits at the battlefield centre. */
export function isCenterObjective(
  config: FullConfig,
  coordinates: Coordinate,
): boolean {
  return (
    coordinates[0] === config.base.size.width / 2 &&
    coordinates[1] === config.base.size.height / 2
  );
}

/** Fixed offset of the two hidden-supplies markers from the centre. */
export function getHiddenSuppliesCoords(): Coordinate {
  // Angle 36.254deg; a = 3.5482, b = 4.83842.
  return [4.8, 3.5];
}
