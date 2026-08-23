// Turning a resolved fit into a row combined.yml can hold.
//
// The converters each work out where a 40kdc piece goes in their own terms and
// end at the same place: a `Placed` (see CONTEXT.md), which has to come out as
// a YAML row. That last step — round to 3dp so the generated file is
// byte-stable, and spell the box as the `{x, y, width, height, rotation}` a
// feature placement carries — is the same for all of them, so it lives here
// rather than in each converter.

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
