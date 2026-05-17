import type { Coordinate, FullConfig } from "./types";

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

/**
 * Fixed offset of the two hidden-supplies markers from the centre.
 * Derived at angle 36.254deg: a = 3.5482 (y), b = 4.83842 (x).
 */
const HIDDEN_SUPPLIES_OFFSET: Coordinate = [4.83842, 3.5482];

/** Fixed offset of the two hidden-supplies markers from the centre. */
export function getHiddenSuppliesCoords(): Coordinate {
  return HIDDEN_SUPPLIES_OFFSET;
}
