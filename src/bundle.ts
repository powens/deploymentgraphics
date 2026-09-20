/**
 * Entry point for the browser demo bundle (`dist/bundle.js`, imported by
 * `static/app.js`) — not a published entry point.
 *
 * The app needs more than the package's public interface: it owns a set of
 * viewer controls the package has no concept of — including the two the event
 * matrix derives, which the renderer itself never reads — and its YAML editor
 * tab needs a YAML parser the renderer has no use for. Those live here rather
 * than in `index.ts` so serving the demo does not widen what the package
 * commits to.
 *
 * `js-yaml` is re-exported rather than pulled from a CDN by `index.html`, so
 * the site has no third-party runtime dependency and cannot drift from the
 * version `gen-presets.mjs` authors against. `tsconfig.build.json` excludes
 * this module, so the import never reaches `lib/` — the published package
 * still parses no YAML.
 */
export { makeMissionCard } from "./main.js";
export * as yaml from "js-yaml";
export {
  controlElement,
  controlSpec,
  controlsToSearch,
  deriveControls,
  initialControls,
  readControlsFromDom,
  terrainForTemplateSet,
  writeControlsToDom,
  writeDerivedControlsToDom,
} from "./viewer-controls.js";
export { buildConfig } from "./presets/build-config.js";
export { baseConfig } from "./presets/base.js";
export { missions } from "./presets/missions.js";
