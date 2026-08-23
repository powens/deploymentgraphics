/**
 * Ready-to-use configuration: the default board styling, the six standard
 * missions, the built-in terrain, and {@link buildConfig} to assemble them
 * into a `FullConfig` for `makeMissionCard`.
 *
 * This is a published entry point (`deploymentgraphics/presets`), so it holds
 * exactly what the package root holds — no more. The event matrix is the one
 * preset kept out: no renderer reads it, only the browser demo drives its
 * dropdowns from it, and that reaches it by path through `bundle.ts`.
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
