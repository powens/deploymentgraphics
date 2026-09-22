// Helpers for writing converter output as combined.yml rows.

/** Round to 3 dp; normalise -0 to 0 so combined.yml stays byte-stable. */
export const round = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
};

/**
 * A `features` row for a `Placed`, rounded for the emitted file.
 *
 * Always `mirror: false`: the source already lists pieces for both halves of
 * the board, so mirroring would draw each twice.
 *
 * @param {{ name: string, box: object, rotation: number }} placed
 * @param {string} color - a theme.yml `feature.palette` key.
 */
export function featureRow(placed, color) {
  return {
    type: placed.name,
    x: round(placed.box.x),
    y: round(placed.box.y),
    width: round(placed.box.width),
    height: round(placed.box.height),
    rotation: round(placed.rotation),
    color,
    mirror: false,
  };
}
