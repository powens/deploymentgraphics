/* global jsyaml */
import {
  makeMissionCard,
  deployments,
  gwTerrain,
  buildMissionIndex,
  listDispositions,
  findBoards,
  deploymentIdForPattern,
} from "./bundle.js";
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

// Dropdown options derive from the generated presets in the bundle, which are
// generated from the YAML (see scripts/gen-presets.mjs). The persistence
// allowlists derive from these in turn, so options, allowlists, and the
// underlying YAML can never drift apart. Each id is also the YAML filename /
// layout key. Deployment labels are the deployment `name`.
const DEPLOYMENTS = Object.entries(deployments).map(([id, d]) => ({
  id,
  label: d.name,
}));
const TERRAINS = Object.keys(gwTerrain.layout).map((id) => ({
  id,
  label: `GW Layout ${id}`,
}));
const DEPLOYMENT_IDS = DEPLOYMENTS.map((d) => d.id);
const TERRAIN_IDS = TERRAINS.map((t) => t.id);

// The mission layer: a disposition pair + a board variant that together pin
// both the deployment and the layout. Derived from the terrain (every ported
// 40kdc layout carries its dispositions + deployment_pattern_id), so it can
// never drift from the YAML. The mission section just *drives* the Deployment
// and Layout selects below — those stay the render source of truth and the
// escape hatch for freeform/demo combinations.
const DISPOSITIONS = listDispositions(gwTerrain);
const BOARDS_BY_ID = new Map();
for (const mission of buildMissionIndex(gwTerrain)) {
  for (const board of mission.boards) {
    BOARDS_BY_ID.set(board.layoutId, board);
  }
}

// The deployment a board resolves to, by name (each board variant of a pair
// resolves to a distinct deployment, so the name disambiguates the variants).
function boardDeploymentName(board) {
  const id = deploymentIdForPattern(board.deploymentPatternId);
  return deployments[id]?.name ?? board.deploymentPatternId;
}

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
    fetchYaml("./data/terrain/combined.yml"),
  ]);
  // Spread rather than mutate: the cached objects are shared across redraws.
  // combined.yml already holds the demo layout + the ported 40kdc layouts.
  return {
    deployment: missionConfig,
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
const rotationSelector = document.getElementById("rotation");
const showGrid = document.getElementById("show-grid");
const controlEls = [
  missionSelector,
  terrainSelector,
  rotationSelector,
  showGrid,
];

// The mission section's selects. Kept out of controlEls: they don't feed the
// render directly (they drive missionSelector/terrainSelector) and have their
// own handlers. updateModeUi disables them alongside the controls in yaml mode.
const dispo1Selector = document.getElementById("disposition-1");
const dispo2Selector = document.getElementById("disposition-2");
const boardSelector = document.getElementById("board-variant");
const missionEls = [dispo1Selector, dispo2Selector, boardSelector];

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

populateSelect(missionSelector, DEPLOYMENTS);
populateSelect(terrainSelector, TERRAINS);

// --- Mission section ------------------------------------------------------

// Fill a disposition select with a neutral placeholder plus the dispositions.
function populateDispositions(select) {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "—";
  select.appendChild(placeholder);
  populateSelect(
    select,
    DISPOSITIONS.map((d) => ({ id: d, label: d })),
  );
}
populateDispositions(dispo1Selector);
populateDispositions(dispo2Selector);

// Rebuild the board-variant options for a list of boards, optionally
// preselecting one. With no boards (a pairing nothing was designed for) the
// select shows a single disabled hint and the Deployment/Layout stay put.
function populateBoards(boards, selectedId) {
  boardSelector.replaceChildren();
  if (boards.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No board for this pairing";
    option.disabled = true;
    boardSelector.appendChild(option);
    boardSelector.value = "";
    return;
  }
  boards.forEach((board, i) => {
    const option = document.createElement("option");
    option.value = board.layoutId;
    option.textContent = `${i + 1}. ${boardDeploymentName(board)}`;
    boardSelector.appendChild(option);
  });
  boardSelector.value =
    selectedId && boards.some((b) => b.layoutId === selectedId)
      ? selectedId
      : boards[0].layoutId;
}

// Apply a board: derive its deployment, point the Deployment + Layout selects
// at it, and trigger the same render path a manual control change would. The
// disposition selects are left as the user set them (no programmatic 'change'
// fires, so they don't jump around).
function applyBoard(layoutId) {
  const board = BOARDS_BY_ID.get(layoutId);
  if (!board) {
    return;
  }
  boardSelector.value = layoutId;
  missionSelector.value = deploymentIdForPattern(board.deploymentPatternId);
  terrainSelector.value = board.layoutId;
  onControlChange();
}

// Both dispositions chosen → list the pair's boards and apply the first.
function onDispositionChange() {
  const a = dispo1Selector.value;
  const b = dispo2Selector.value;
  if (!a || !b) {
    populateBoards([]);
    return;
  }
  const boards = findBoards(gwTerrain, a, b);
  populateBoards(boards);
  if (boards.length > 0) {
    applyBoard(boards[0].layoutId);
  }
}

// Reflect the current Layout (`t`) back into the mission section: a known
// board sets the three selects to match; anything else (a demo layout or a
// hand-picked mismatched Deployment+Layout) clears them to the neutral state.
function syncMissionSectionFromControls() {
  const board = BOARDS_BY_ID.get(terrainSelector.value);
  // A board only counts as the selected mission when the Deployment select
  // still matches the one it derives — a hand-picked mismatch is "Custom".
  if (board && deploymentIdForPattern(board.deploymentPatternId) === missionSelector.value) {
    dispo1Selector.value = board.dispositions[0];
    dispo2Selector.value = board.dispositions[1];
    populateBoards(
      findBoards(gwTerrain, board.dispositions[0], board.dispositions[1]),
      board.layoutId,
    );
  } else {
    dispo1Selector.value = "";
    dispo2Selector.value = "";
    populateBoards([]);
  }
}

function controlState() {
  return {
    m: missionSelector.value,
    t: terrainSelector.value,
    grid: showGrid.checked,
    rot: rotationSelector.value,
  };
}

function applyControls(controls) {
  missionSelector.value = controls.m;
  terrainSelector.value = controls.t;
  showGrid.checked = controls.grid;
  rotationSelector.value = controls.rot;
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
    const controls = controlState();
    const config = await buildConfig(controls);
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
  for (const el of [...controlEls, ...missionEls]) {
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
    const config = await buildConfig(controlState());
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

// Mission section drives the Deployment + Layout selects.
dispo1Selector.addEventListener("change", onDispositionChange);
dispo2Selector.addEventListener("change", onDispositionChange);
boardSelector.addEventListener("change", () => {
  if (boardSelector.value) {
    applyBoard(boardSelector.value);
  }
});
// A manual Deployment/Layout change re-syncs the mission section (to a matching
// board or the neutral state). Programmatic changes from applyBoard don't fire
// 'change', so this only runs on real user interaction.
missionSelector.addEventListener("change", syncMissionSectionFromControls);
terrainSelector.addEventListener("change", syncMissionSectionFromControls);

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

  const fromUrl = urlHasControls();
  if (fromUrl) {
    // An explicit URL (e.g. a shared link) wins over any saved state.
    applyControls(readControlsFromUrl(DEPLOYMENT_IDS, TERRAIN_IDS));
  } else {
    const saved = loadState();
    if (saved) {
      applyControls(
        sanitizeControls(saved.controls, DEPLOYMENT_IDS, TERRAIN_IDS),
      );
      if (saved.mode === "yaml" && typeof saved.yaml === "string") {
        mode = "yaml";
        yamlEditor.value = saved.yaml;
      }
    } else {
      applyControls(DEFAULT_CONTROLS);
    }
  }

  // Reflect the restored Layout into the mission section (dispositions + board).
  syncMissionSectionFromControls();
  updateModeUi();
  syncUrl();
  // A URL-driven load is read-only for persistence: it must not overwrite
  // the visitor's saved session (which may hold a YAML override). Their
  // own later edits still persist normally.
  if (!fromUrl) {
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
