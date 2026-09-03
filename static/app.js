/* global jsyaml */
import {
  makeMissionCard,
  buildConfig,
  mergeTerrain,
  missions,
  gwTerrain,
  eventMatrix,
  resolveMission,
  resolveTerrainLayout,
  controlSpec,
  controlsToSearch,
  initialControls,
  readControlsFromDom,
  writeControlsToDom,
} from "./bundle.js";
import { loadState, saveState } from "./state.js";

// The nine controls are spelled once, in `src/viewer-controls.ts`: every
// default, allowlist, element id and DOM read or write below comes off
// `controlSpec` rather than being restated here. Only the option *labels* are
// the app's own, since they are presentation. The two dispositions + layout
// resolve to a deployment via the event matrix, which selects the Deployment
// dropdown; that dropdown can also be set directly.

// YAML files never change within a session, so cache by URL. The promise
// (not the result) is cached, which also dedupes concurrent fetches.
const yamlCache = new Map();

function fetchYaml(url) {
  let pending = yamlCache.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url} (${response.status})`);
      }
      return jsyaml.load(await response.text());
    })();
    // Drop failed fetches from the cache so a later redraw can retry.
    pending.catch(() => yamlCache.delete(url));
    yamlCache.set(url, pending);
  }
  return pending;
}

// The deployment a disposition pairing + layout maps to, used to drive the
// Deployment dropdown (which the user may then override directly).
function resolvedMissionId(controls) {
  return resolveMission(eventMatrix, controls.da, controls.db, controls.lay);
}

// Fetch the four YAML slices for the current controls and assemble them with
// the renderer's own `buildConfig` — the same seam the bundled presets use, so
// the app and the library can never drift on assembly. Templates live in
// templates-simple.yml (illustrative) or templates-real.yml (detailed GW
// footprints), selected by the Templates control; combined.yml holds the demo
// layout + the ported 40kdc layouts. `mergeTerrain` is the one place the two
// terrain files reunite — both template files share the same names, so any
// layout renders against either set.
async function configFromControls(controls) {
  const [mission, base, terrainTemplates, terrainLayouts] = await Promise.all([
    fetchYaml(`./data/deployment/${controls.m}.yml`),
    fetchYaml("./data/base.yml"),
    fetchYaml(`./data/terrain/templates-${controls.tpl}.yml`),
    fetchYaml("./data/terrain/combined.yml"),
  ]);
  return buildConfig({
    mission,
    base,
    terrain: mergeTerrain(terrainTemplates, terrainLayouts),
    layout: controls.t,
    grid: controls.grid,
    territory: controls.territory,
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Defer the revoke: revoking synchronously can cancel a download that
  // the browser has not yet started fetching from the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// --- DOM references -------------------------------------------------------

const SPEC = new Map(controlSpec.map((row) => [row.key, row]));

function controlEl(key) {
  return document.getElementById(SPEC.get(key).elementId);
}

// Every control element, in spec order — the ids are the spec's, not the app's.
const controlEls = controlSpec.map((row) => controlEl(row.key));
// Changing a disposition or the layout re-derives the deployment and terrain;
// the other controls (those two dropdowns included) just re-render. The two
// named below are the only ones the app addresses individually.
const derivedFromControls = ["da", "db", "lay"].map((key) => controlEl(key));
const deploymentSelector = controlEl("m");
const terrainSelector = controlEl("t");

const stage = document.getElementById("stage");
const exportMenu = document.getElementById("export-menu");
const exportPngButton = document.getElementById("export-png");
const exportSvgButton = document.getElementById("export-svg");
const copyLinkButton = document.getElementById("copy-link");

const tabControls = document.getElementById("tab-controls");
const tabYaml = document.getElementById("tab-yaml");
const panelControls = document.getElementById("panel-controls");
const panelYaml = document.getElementById("panel-yaml");
const yamlEditor = document.getElementById("yaml-editor");
const yamlError = document.getElementById("yaml-error");
const resetBanner = document.getElementById("reset-banner");
const resetButton = document.getElementById("reset-controls");

// --- Controls -------------------------------------------------------------

// Option labels are presentation, so they stay here; the option *values* come
// off each row's allowlist, which is what keeps the dropdowns, the URL and the
// underlying YAML from drifting. Rows marked `staticOptions` carry their
// <option>s in index.html instead, and `static/index.test.js` holds that
// markup to the same value set.
//
// A control the map says nothing about labels its options with their own
// values, which is what `da`, `db` and `lay` want anyway. Without that
// fallback, adding a select row to the spec throws here at load — before a
// single listener is wired, so the page comes up blank — rather than showing
// a plain dropdown.
const OPTION_LABEL = {
  m: (id) => missions[id].name,
  t: (id) => `GW Layout ${id}`,
};
const identity = (id) => id;

for (const row of controlSpec) {
  if (row.kind !== "select" || row.staticOptions) {
    continue;
  }
  const select = controlEl(row.key);
  const label = OPTION_LABEL[row.key] ?? identity;
  for (const id of row.allowed) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label(id);
    select.appendChild(option);
  }
}

// "controls" — the dropdowns drive the render. "yaml" — the editor text
// does. The first edit of the YAML textarea promotes the mode to "yaml";
// `start()` resolves the mode a page load comes up in.
let mode = "controls";

// --- Rendering ------------------------------------------------------------

function setStageMessage(text, isError = false) {
  const p = document.createElement("p");
  p.className = isError ? "stage-msg error" : "stage-msg";
  p.textContent = text;
  stage.replaceChildren(p);
}

function setExportEnabled(enabled) {
  exportPngButton.disabled = !enabled;
  exportSvgButton.disabled = !enabled;
}

function setYamlError(message) {
  yamlError.textContent = message ?? "";
  yamlError.hidden = !message;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Rotate the rendered card by ±90° in place: swap the viewBox dimensions and
// wrap the content in a rotated group, mapping the w×h board into the swapped
// h×w viewport. Doing it inside the SVG (rather than via CSS) keeps the card
// correctly sized and makes exports — which serialize this same SVG — match
// what's on screen. The <title> stays a direct child for accessibility.
function rotateCard(svg, deg) {
  if (deg !== 90 && deg !== -90) {
    return svg;
  }
  const { width: w, height: h } = svg.viewBox.baseVal;
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute(
    "transform",
    deg === 90 ? `translate(${h} 0) rotate(90)` : `translate(0 ${w}) rotate(-90)`,
  );
  for (const child of Array.from(svg.childNodes)) {
    if (child.nodeName !== "title") {
      group.appendChild(child);
    }
  }
  svg.appendChild(group);
  svg.setAttribute("viewBox", `0 0 ${h} ${w}`);
  return svg;
}

let renderGeneration = 0;

async function renderFromControls() {
  const generation = ++renderGeneration;
  // No card to export until this render finishes successfully.
  setExportEnabled(false);
  setStageMessage("Rendering…");
  try {
    const controls = readControlsFromDom(document);
    const config = await configFromControls(controls);
    if (generation !== renderGeneration) {
      return;
    }
    // makeMissionCard builds off-DOM: a throw never blanks the stage.
    const card = rotateCard(makeMissionCard(config), Number(controls.rot));
    stage.replaceChildren(card);
    setExportEnabled(true);
  } catch (error) {
    if (generation !== renderGeneration) {
      return;
    }
    setStageMessage(error.message, true);
  }
}

function renderFromYaml() {
  // Cancel any in-flight controls render so its result cannot land late.
  ++renderGeneration;
  // Export is not touched on the error paths below: a bad edit keeps the
  // last good render on the stage, and that card stays exportable.
  let config;
  try {
    config = jsyaml.load(yamlEditor.value);
  } catch (error) {
    setYamlError(error.message);
    return;
  }
  if (!config || typeof config !== "object") {
    setYamlError("YAML must describe a config object.");
    return;
  }
  try {
    // Build off-DOM first: an invalid config throws before the stage is
    // touched, so the last good render survives a bad edit.
    const card = makeMissionCard(config);
    stage.replaceChildren(card);
    setExportEnabled(true);
    setYamlError(null);
  } catch (error) {
    setYamlError(`Render failed: ${error.message}`);
  }
}

// --- Tabs & mode ----------------------------------------------------------

function updateModeUi() {
  const yamlMode = mode === "yaml";
  for (const el of controlEls) {
    el.disabled = yamlMode;
  }
  resetBanner.hidden = !yamlMode;
  // The URL cannot carry a YAML override, so Copy link is meaningless here.
  copyLinkButton.disabled = yamlMode;
}

async function openYamlTab() {
  // Clear any error left over from a previous yaml session up front, so it
  // does not linger above the editor while the config below is fetched.
  setYamlError(null);
  // In yaml mode the editor already holds the user's edits — keep them.
  if (mode === "yaml") {
    return;
  }
  // In controls mode, refill the editor with the current merged config.
  try {
    const config = await configFromControls(readControlsFromDom(document));
    // The user may have started editing during the fetch, promoting the
    // mode to yaml — in that case keep their edits, do not overwrite them.
    if (mode === "yaml") {
      return;
    }
    yamlEditor.value = jsyaml.dump(config);
    setYamlError(null);
  } catch (error) {
    setYamlError(error.message);
  }
}

function activateTab(name) {
  const isControls = name === "controls";
  tabControls.setAttribute("aria-selected", String(isControls));
  tabYaml.setAttribute("aria-selected", String(!isControls));
  panelControls.hidden = !isControls;
  panelYaml.hidden = isControls;
  if (!isControls) {
    openYamlTab();
  }
}

// --- Persistence ----------------------------------------------------------

function syncUrl() {
  // In yaml mode keep the URL bare: it cannot carry the override, and a
  // bare URL lets a reload fall through to the localStorage-restored state.
  const query =
    mode === "yaml" ? "" : controlsToSearch(readControlsFromDom(document));
  window.history.replaceState(
    null,
    "",
    query ? `?${query}` : window.location.pathname,
  );
}

function persist() {
  saveState({
    mode,
    controls: readControlsFromDom(document),
    yaml: mode === "yaml" ? yamlEditor.value : null,
  });
}

// --- Event wiring ---------------------------------------------------------

function onControlChange() {
  syncUrl();
  persist();
  renderFromControls();
}

// A disposition/layout change re-derives the deployment and terrain dropdowns,
// then renders. The terrain layout is matched from combined.yml on the
// disposition pair + deployment; cells the 40kdc source does not cover fall
// back to the demo layout "1". Both dropdowns remain overridable directly.
function onDerivedControlChange() {
  const controls = readControlsFromDom(document);
  const missionId = resolvedMissionId(controls);
  deploymentSelector.value = missionId;
  terrainSelector.value =
    resolveTerrainLayout(gwTerrain.layout, controls.da, controls.db, missionId) ??
    "1";
  onControlChange();
}

for (const el of controlEls) {
  el.addEventListener(
    "change",
    derivedFromControls.includes(el) ? onDerivedControlChange : onControlChange,
  );
}

let yamlRenderTimer;

yamlEditor.addEventListener("input", () => {
  // The first edit promotes yaml to the source of truth.
  if (mode === "controls") {
    mode = "yaml";
    updateModeUi();
    syncUrl();
  }
  // Debounce: re-render shortly after the user stops typing.
  clearTimeout(yamlRenderTimer);
  yamlRenderTimer = setTimeout(() => {
    renderFromYaml();
    persist();
  }, 300);
});

function resetToControls() {
  mode = "controls";
  clearTimeout(yamlRenderTimer);
  updateModeUi();
  syncUrl();
  persist();
  activateTab("controls");
  renderFromControls();
}

resetButton.addEventListener("click", resetToControls);
tabControls.addEventListener("click", () => activateTab("controls"));
tabYaml.addEventListener("click", () => activateTab("yaml"));

// --- Export ---------------------------------------------------------------

function filenameStem() {
  if (mode === "yaml") {
    return "deployment-graphics";
  }
  const controls = readControlsFromDom(document);
  return `${controls.m.replace(/_/g, "-")}-layout-${controls.lay}`;
}

function exportSvg() {
  const svg = stage.querySelector("svg");
  if (!svg) {
    return;
  }
  const markup = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([markup], { type: "image/svg+xml" });
  downloadBlob(blob, `${filenameStem()}.svg`);
  exportMenu.removeAttribute("open");
}

const PNG_EXPORT_WIDTH = 2000;

function exportPng() {
  const svg = stage.querySelector("svg");
  if (!svg) {
    return;
  }
  const viewBox = svg.viewBox.baseVal;
  const width = PNG_EXPORT_WIDTH;
  const height = Math.round((width * viewBox.height) / viewBox.width);

  const clone = svg.cloneNode(true);
  clone.setAttribute("width", `${width}`);
  clone.setAttribute("height", `${height}`);
  const markup = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml" }),
  );

  const image = new Image();
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    alert("PNG export failed: the card could not be rendered.");
  };
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(svgUrl);
      alert("PNG export failed: no 2D canvas context is available.");
      return;
    }
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("PNG export failed: the image could not be encoded.");
        return;
      }
      downloadBlob(blob, `${filenameStem()}.png`);
    }, "image/png");
  };
  image.src = svgUrl;
  exportMenu.removeAttribute("open");
}

const COPY_LINK_LABEL = "Copy link";
let copyLinkResetTimer;

// Show transient feedback on the button, restoring to the fixed label.
// Using a literal (not the live textContent) avoids a rapid second click
// capturing "Copied" as the label to restore.
function flashCopyLink(message) {
  copyLinkButton.textContent = message;
  clearTimeout(copyLinkResetTimer);
  copyLinkResetTimer = setTimeout(() => {
    copyLinkButton.textContent = COPY_LINK_LABEL;
  }, 1500);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    flashCopyLink("Copied");
  } catch {
    flashCopyLink("Copy failed");
  }
}

exportSvgButton.addEventListener("click", exportSvg);
exportPngButton.addEventListener("click", exportPng);
copyLinkButton.addEventListener("click", copyLink);

// The native <details> menu only closes on a second summary click; also
// dismiss it on an outside click or Escape, as menus are expected to.
document.addEventListener("click", (event) => {
  if (exportMenu.open && !exportMenu.contains(event.target)) {
    exportMenu.removeAttribute("open");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && exportMenu.open) {
    exportMenu.removeAttribute("open");
  }
});

// --- Startup --------------------------------------------------------------

function start() {
  setExportEnabled(false);

  // Which of the URL and the saved session wins, and whether the result may be
  // written back, are `initialControls`' rules — this is where they are
  // applied to the page.
  const initial = initialControls({
    search: window.location.search,
    saved: loadState(),
  });
  writeControlsToDom(document, initial.controls);
  mode = initial.mode;
  if (initial.yaml !== null) {
    yamlEditor.value = initial.yaml;
  }

  updateModeUi();
  syncUrl();
  if (initial.persist) {
    persist();
  }

  if (mode === "yaml") {
    activateTab("yaml");
    renderFromYaml();
  } else {
    activateTab("controls");
    renderFromControls();
  }
}

start();
