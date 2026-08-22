/**
 * Entry point for the browser demo bundle (`dist/bundle.js`, imported by
 * `static/app.js`) — not a published entry point.
 *
 * The app needs more than the package's public interface: it merges a
 * templates file with a layouts file at fetch time, and it drives its
 * dropdowns from the event matrix, which the renderer itself never reads.
 * Those live here rather than in `index.ts` so serving the demo does not
 * widen what the package commits to.
 */
export { makeMissionCard } from "./main.js";
export { mergeTerrain } from "./terrain-config.js";
export {
  dispositions,
  resolveMission,
  resolveTerrainLayout,
} from "./event-matrix.js";
export { buildConfig } from "./presets/build-config.js";
export { eventMatrix } from "./presets/event-matrix.js";
export { gwTerrain } from "./presets/terrain.js";
export { missions } from "./presets/missions.js";
