/**
 * Entry point for the demo bundle (`dist/bundle.js`, imported by
 * `static/app.js`); not published. Holds what the demo needs beyond the
 * package API (the viewer controls and session) so `index.ts` stays narrow.
 *
 * `js-yaml` (used by the session) is bundled rather than loaded from a CDN so
 * the site has no third-party runtime dependency. `tsconfig.build.json`
 * excludes this module, so it never reaches `lib/`.
 */
export {
  controlElement,
  controlSpec,
  readControlsFromDom,
  setControlsLocked,
  writeControlsToDom,
} from "./viewer-controls.js";
export {
  editorYaml,
  openSession,
  renderCard,
  step,
  STORAGE_KEY,
} from "./viewer-session.js";
export { missions } from "./presets/missions.js";
export { bindTabKeys, selectTab } from "./viewer-tabs.js";
