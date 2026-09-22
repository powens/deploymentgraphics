/**
 * Entry point for the demo bundle (`dist/bundle.js`, imported by
 * `static/app.js`); not published. Holds what the demo needs beyond the
 * package API (viewer controls, a YAML parser) so `index.ts` stays narrow.
 *
 * `js-yaml` is bundled rather than loaded from a CDN so the site has no
 * third-party runtime dependency. `tsconfig.build.json` excludes this module,
 * so it never reaches `lib/`.
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
