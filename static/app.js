/* global jsyaml */
import { makeMissionCard } from "./bundle.js";
import {
  DEFAULT_CONTROLS,
  clearUrl,
  loadState,
  readControlsFromUrl,
  sanitizeControls,
  saveState,
  urlHasControls,
  writeControlsToUrl,
} from "./state.js";

// Single source of truth for the dropdowns: both the <select> options and
// the persistence allowlists are derived from these lists, so the two can
// never drift apart. Each id is also the YAML filename / layout key.
const MISSIONS = [
  { id: "dawn_of_war", label: "Dawn of War" },
  { id: "crucible_of_battle", label: "Crucible of Battle" },
  { id: "hammer_and_anvil", label: "Hammer and Anvil" },
  { id: "search_and_destroy", label: "Search and Destroy" },
  { id: "sweeping_engagement", label: "Sweeping Engagement" },
  { id: "tipping_point", label: "Tipping Point" },
];
const TERRAINS = [
  { id: "1", label: "GW Layout 1" },
  { id: "2", label: "GW Layout 2" },
];
const MISSION_IDS = MISSIONS.map((m) => m.id);
const TERRAIN_IDS = TERRAINS.map((t) => t.id);

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

async function buildConfig(controls) {
  const [missionConfig, baseConfig, terrainObj] = await Promise.all([
    fetchYaml(`./data/deployment/${controls.m}.yml`),
    fetchYaml("./data/base.yml"),
    fetchYaml("./data/terrain/gw.yml"),
  ]);
  // Spread rather than mutate: the cached objects are shared across redraws.
  return {
    deployment: { ...missionConfig, hidden_supplies: controls.hs },
    base: { ...baseConfig, grid: { ...baseConfig.grid, draw: controls.grid } },
    terrain: { ...terrainObj, layout_name: controls.t },
  };
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

const missionSelector = document.getElementById("mission");
const terrainSelector = document.getElementById("terrain");
const hiddenSupplies = document.getElementById("hidden-supplies");
const showGrid = document.getElementById("show-grid");
const controlEls = [missionSelector, terrainSelector, hiddenSupplies, showGrid];

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

function populateSelect(select, items) {
  for (const { id, label } of items) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    select.appendChild(option);
  }
}

populateSelect(missionSelector, MISSIONS);
populateSelect(terrainSelector, TERRAINS);

function controlState() {
  return {
    m: missionSelector.value,
    t: terrainSelector.value,
    hs: hiddenSupplies.checked,
    grid: showGrid.checked,
  };
}

function applyControls(controls) {
  missionSelector.value = controls.m;
  terrainSelector.value = controls.t;
  hiddenSupplies.checked = controls.hs;
  showGrid.checked = controls.grid;
}

// "controls" — the dropdowns drive the render. "yaml" — the editor text
// does. The first edit of the YAML textarea promotes the mode to "yaml".
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

let renderGeneration = 0;

async function renderFromControls() {
  const generation = ++renderGeneration;
  // No card to export until this render finishes successfully.
  setExportEnabled(false);
  setStageMessage("Rendering…");
  try {
    const config = await buildConfig(controlState());
    if (generation !== renderGeneration) {
      return;
    }
    // makeMissionCard builds off-DOM: a throw never blanks the stage.
    const card = makeMissionCard(config);
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
  // In yaml mode the editor already holds the user's edits — keep them.
  if (mode === "yaml") {
    return;
  }
  // In controls mode, refill the editor with the current merged config.
  try {
    const config = await buildConfig(controlState());
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
  if (mode === "yaml") {
    clearUrl();
  } else {
    writeControlsToUrl(controlState());
  }
}

function persist() {
  saveState({
    mode,
    controls: controlState(),
    yaml: mode === "yaml" ? yamlEditor.value : null,
  });
}

// --- Event wiring ---------------------------------------------------------

function onControlChange() {
  syncUrl();
  persist();
  renderFromControls();
}

for (const el of controlEls) {
  el.addEventListener("change", onControlChange);
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
  const controls = controlState();
  return `${controls.m.replace(/_/g, "-")}-layout-${controls.t}`;
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

  if (urlHasControls()) {
    // An explicit URL (e.g. a shared link) wins over any saved state.
    applyControls(readControlsFromUrl(MISSION_IDS, TERRAIN_IDS));
  } else {
    const saved = loadState();
    if (saved) {
      applyControls(sanitizeControls(saved.controls, MISSION_IDS, TERRAIN_IDS));
      if (saved.mode === "yaml" && typeof saved.yaml === "string") {
        mode = "yaml";
        yamlEditor.value = saved.yaml;
      }
    } else {
      applyControls(DEFAULT_CONTROLS);
    }
  }

  updateModeUi();
  syncUrl();
  persist();

  if (mode === "yaml") {
    activateTab("yaml");
    renderFromYaml();
  } else {
    activateTab("controls");
    renderFromControls();
  }
}

start();
