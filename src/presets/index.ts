/**
 * Ready-to-use configuration: the default board styling, the six standard
 * deployments, the built-in terrain, and {@link buildConfig} /
 * {@link buildMissionConfig} to assemble them into a `FullConfig` for
 * `makeMissionCard`.
 */
export { baseConfig } from "./base.js";
export { gwTerrain } from "./terrain.js";
export {
  deployments,
  dawnOfWar,
  crucibleOfBattle,
  hammerAndAnvil,
  searchAndDestroy,
  sweepingEngagement,
  tippingPoint,
} from "./deployments.js";
export type { DeploymentId } from "./deployments.js";
export { buildConfig, buildMissionConfig } from "./build-config.js";
export type {
  BuildConfigOptions,
  BuildMissionConfigOptions,
} from "./build-config.js";
export { baseTheme } from "./theme.js";
