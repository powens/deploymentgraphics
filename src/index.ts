/**
 * deploymentgraphics — render Warhammer 40k deployment maps as SVG.
 *
 * `makeMissionCard(config)` is the entry point: it takes a `FullConfig`
 * and returns an `<svg>` element. Pair it with the `presets` (also
 * re-exported here) and `buildConfig` to render the standard missions
 * with one call.
 *
 * Rendering creates SVG nodes via `document.createElementNS`, so this
 * runs in a browser or any environment with a DOM (e.g. happy-dom or
 * jsdom for server-side rendering).
 */
export * from "./main.js";
export * from "./types.js";
export * from "./theme.js";
export * from "./building-coordinates.js";
export * from "./placement.js";
export * from "./buildings.js";
export * from "./terrain-config.js";
export * from "./event-matrix.js";
export * from "./dom-helpers.js";
export * from "./presets/index.js";
