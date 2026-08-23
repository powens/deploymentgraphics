/**
 * deploymentgraphics — render Warhammer 40k deployment maps as SVG.
 *
 * `makeMissionCard(config)` is the entry point: it takes a `FullConfig`
 * and returns an `<svg>` element. Pair it with the presets (also
 * re-exported here) and `buildConfig` to render the standard missions
 * with one call.
 *
 * `makeMissionCard` creates SVG nodes via `document.createElementNS`, so it
 * needs a browser or another DOM. Server-side, `renderMissionCardToString`
 * renders the same card to markup with no DOM and no dependencies.
 *
 * ## What this module exports
 *
 * The two renderers, the presets, and the type graph of the config they
 * consume — nothing else. The geometry, placement and SVG-backend primitives
 * the renderers are built from stay internal: they are implementation, they
 * change with it, and a consumer never has to learn them to render a card.
 *
 * Internal code reaches them by path (`./placement.js`, `./svg-backend.js`)
 * rather than through this barrel, and the browser app has its own entry in
 * `bundle.ts`. Naming the preset modules individually rather than
 * re-exporting `presets/index.js` also keeps the event matrix — which no
 * renderer reads — out of the package's module graph.
 */

// --- Renderers ---
export { makeMissionCard, renderMissionCardToString } from "./main.js";
export type { RenderToStringOptions } from "./main.js";

// --- Presets ---
export { baseConfig } from "./presets/base.js";
export { baseTheme } from "./presets/theme.js";
export { buildConfig } from "./presets/build-config.js";
export type { BuildConfigOptions } from "./presets/build-config.js";
export { gwTerrain } from "./presets/terrain.js";
export { gwTemplatesReal } from "./presets/templates-real.js";
export {
  missions,
  dawnOfWar,
  crucibleOfBattle,
  hammerAndAnvil,
  searchAndDestroy,
  sweepingEngagement,
  tippingPoint,
} from "./presets/missions.js";
export type { MissionId } from "./presets/missions.js";

// --- The config a renderer consumes ---
// `buildConfig` assembles one; the README also documents building a
// `FullConfig` by hand, which needs the whole graph nameable.
export type {
  Annotation,
  AttackerDefender,
  BaseConfig,
  Coordinate,
  DeploymentConfig,
  FullConfig,
  Objective,
  RuntimeTerrainConfig,
  Size,
  SVGProperties,
} from "./types.js";
export type {
  Anchor,
  BuildingPlacement,
  CanvasSize,
  CornerSpec,
  PathSegment,
  PathTemplate,
  Point,
  PolygonTemplate,
  RectTemplate,
  Template,
} from "./building-coordinates.js";
export type {
  FeaturePlacement,
  IconPlacement,
  TerrainConfig,
  TerrainLayout,
} from "./terrain-config.js";

// --- Theming ---
// `baseTheme` is the default; `Theme` is what a replacement must satisfy.
export type { Theme } from "./theme.js";
