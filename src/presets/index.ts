/**
 * `deploymentgraphics/presets`: the default board styling, the six standard
 * missions, the built-in terrain, the event matrix, and {@link buildConfig}.
 * Must stay a subset of the package root.
 */
export { baseConfig } from "./base.js";
export { gwTerrain } from "./terrain.js";
export { gwTerrainIndex } from "./terrain-index.js";
export { gwTemplatesReal } from "./templates-real.js";
export {
  missions,
  dawnOfWar,
  crucibleOfBattle,
  hammerAndAnvil,
  searchAndDestroy,
  sweepingEngagement,
  tippingPoint,
} from "./missions.js";
export type { MissionId } from "./missions.js";
export { buildConfig } from "./build-config.js";
export type { BuildConfigOptions } from "./build-config.js";
export { baseTheme } from "./theme.js";
export { eventMatrix } from "./event-matrix.js";
