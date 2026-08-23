// Turning a resolved fit into a row combined.yml can hold.
//
// `round` is the one thing every converter needs: the generated file is checked
// in, so every number it carries goes to 3dp or the check job sees a diff in
// the last bits.
//
// `featureRow` is for the two converters that end at a `Placed` (see
// CONTEXT.md) — ruin-to-feature and rect-to-feature. Spelling that box as the
// `{x, y, width, height, rotation}` a feature placement carries is the same
// work for both, so it lives here rather than in each. The other two,
// area-to-building and feature-to-building, emit corner-pin authoring
// placements and only take `round`.

/** Round to 3 dp; normalise -0 to 0 so combined.yml stays byte-stable. */
export const round = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
};

/**
 * A `features` row for a `Placed`, rounded for the emitted file.
 *
 * Always `mirror: false`: a converter fits one piece to one absolute position
 * that the source already gives for both halves of the board, so letting the
 * renderer mirror it would draw each piece twice.
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
