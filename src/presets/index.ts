/**
 * Ready-to-use configuration: the default board styling, the six standard
 * missions, the built-in terrain, and {@link buildConfig} to assemble them
 * into a `FullConfig` for `makeMissionCard`.
 *
 * This is a published entry point (`deploymentgraphics/presets`), so it holds
 * exactly what the package root holds — no more. That includes the event
 * matrix: no renderer reads it, but resolving a matchup to its mission is a
 * published operation (`resolveMission`), and the matrix is what it reads.
 */
export { baseConfig } from "./base.js";
export { gwTerrain } from "./terrain.js";
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
