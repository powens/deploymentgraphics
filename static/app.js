/* global jsyaml */
import { injectMissionCard } from "./bundle.js";

// Single source of truth for the dropdowns: both the <select> options and
// the URL-state allowlists below are derived from these lists, so the two
// can never drift apart. Each id is also the YAML filename / layout key.
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
const DEFAULT_STATE = { m: "dawn_of_war", t: "1", hs: false, grid: false };

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const m = params.get("m");
  const t = params.get("t");
  return {
    m: MISSION_IDS.includes(m) ? m : DEFAULT_STATE.m,
    t: TERRAIN_IDS.includes(t) ? t : DEFAULT_STATE.t,
    hs: params.get("hs") === "1",
    grid: params.get("grid") === "1",
  };
}

function writeStateToUrl(state) {
  // Only carry params that differ from the defaults, so a default-state
  // link stays clean. readStateFromUrl restores any absent param to its
  // default, making this round-trip safe.
  const params = new URLSearchParams();
  if (state.m !== DEFAULT_STATE.m) {
    params.set("m", state.m);
  }
  if (state.t !== DEFAULT_STATE.t) {
    params.set("t", state.t);
  }
  if (state.hs) {
    params.set("hs", "1");
  }
  if (state.grid) {
    params.set("grid", "1");
  }
  const query = params.toString();
  const url = query ? `?${query}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

function filenameStem(state) {
  return `${state.m.replace(/_/g, "-")}-layout-${state.t}`;
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

async function buildConfig(state) {
  const [missionConfig, baseConfig, terrainObj] = await Promise.all([
    fetchYaml(`./data/deployment/${state.m}.yml`),
    fetchYaml("./data/base.yml"),
    fetchYaml("./data/terrain/gw.yml"),
  ]);
  // Spread rather than mutate: the cached objects are shared across redraws.
  return {
    deployment: { ...missionConfig, hidden_supplies: state.hs },
    base: { ...baseConfig, grid: { ...baseConfig.grid, draw: state.grid } },
    terrain: { ...terrainObj, layout_name: state.t },
  };
}

const missionSelector = document.getElementById("mission");
const terrainSelector = document.getElementById("terrain");
const hiddenSupplies = document.getElementById("hidden-supplies");
const showGrid = document.getElementById("show-grid");
const stage = document.getElementById("stage");
const exportMenu = document.getElementById("export-menu");
const exportPngButton = document.getElementById("export-png");
const exportSvgButton = document.getElementById("export-svg");
const copyLinkButton = document.getElementById("copy-link");

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

function setStageMessage(text, isError = false) {
  const p = document.createElement("p");
  p.className = isError ? "stage-msg error" : "stage-msg";
  p.textContent = text;
  stage.replaceChildren(p);
}

function controlState() {
  return {
    m: missionSelector.value,
    t: terrainSelector.value,
    hs: hiddenSupplies.checked,
    grid: showGrid.checked,
  };
}

let renderGeneration = 0;

function setExportEnabled(enabled) {
  exportPngButton.disabled = !enabled;
  exportSvgButton.disabled = !enabled;
}

async function redraw() {
  const generation = ++renderGeneration;
  // No card to export until this render finishes successfully.
  setExportEnabled(false);
  setStageMessage("Rendering…");
  try {
    const config = await buildConfig(controlState());
    if (generation !== renderGeneration) {
      return;
    }
    stage.replaceChildren();
    injectMissionCard(stage, config);
    setExportEnabled(true);
  } catch (error) {
    if (generation !== renderGeneration) {
      return;
    }
    setStageMessage(error.message, true);
  }
}

function exportSvg() {
  const svg = stage.querySelector("svg");
  if (!svg) {
    return;
  }
  const markup = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([markup], { type: "image/svg+xml" });
  downloadBlob(blob, `${filenameStem(controlState())}.svg`);
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
      downloadBlob(blob, `${filenameStem(controlState())}.png`);
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

function onControlChange() {
  writeStateToUrl(controlState());
  redraw();
}

for (const el of [missionSelector, terrainSelector, hiddenSupplies, showGrid]) {
  el.addEventListener("change", onControlChange);
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

const initialState = readStateFromUrl();
missionSelector.value = initialState.m;
terrainSelector.value = initialState.t;
hiddenSupplies.checked = initialState.hs;
showGrid.checked = initialState.grid;
writeStateToUrl(initialState);
redraw();
