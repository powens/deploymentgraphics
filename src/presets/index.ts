/**
 * Ready-to-use configuration: the default board styling, the six standard
 * missions, the built-in terrain, and {@link buildConfig} to assemble them
 * into a `FullConfig` for `makeMissionCard`.
 */
export { baseConfig } from "./base.js";
export { gwTerrain } from "./terrain.js";
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
