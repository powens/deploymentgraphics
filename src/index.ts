/**
 * deploymentgraphics — render Warhammer 40k deployment maps as SVG.
 *
 * `makeMissionCard(config)` returns an `<svg>` element and needs a DOM;
 * `renderMissionCardToString` renders the same card to markup without one.
 * `buildConfig` plus the presets render the standard missions in one call.
 *
 * Geometry, placement and SVG-backend primitives are deliberately not exported.
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
// `gwTerrain.layout`'s matchup metadata without geometry (~1% of the bytes);
// enough for `resolveTerrainLayout`.
export { gwTerrainIndex } from "./presets/terrain-index.js";
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
// The whole graph is exported so a `FullConfig` can be built by hand.
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
export type { Theme } from "./theme.js";

// --- Matchup resolution ---
// Two force dispositions -> the mission and terrain layout for
// `buildConfig({ mission, layout })`.
export {
  resolveMission,
  resolveTerrainLayout,
  eventMatrixKey,
  dispositions,
} from "./event-matrix.js";
export type {
  EventMatrix,
  Layout,
  TerrainLayoutMeta,
} from "./event-matrix.js";
export { eventMatrix } from "./presets/event-matrix.js";
