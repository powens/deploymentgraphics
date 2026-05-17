/* global jsyaml */
import { injectMissionCard } from "./bundle.js";

const MISSION_IDS = [
  "dawn_of_war",
  "crucible_of_battle",
  "hammer_and_anvil",
  "search_and_destroy",
  "sweeping_engagement",
  "tipping_point",
];
const TERRAIN_IDS = ["1", "2"];
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
  const params = new URLSearchParams();
  params.set("m", state.m);
  params.set("t", state.t);
  params.set("hs", state.hs ? "1" : "0");
  params.set("grid", state.grid ? "1" : "0");
  window.history.replaceState(null, "", `?${params.toString()}`);
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
  URL.revokeObjectURL(url);
}

async function fetchYaml(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`);
  }
  return jsyaml.load(await response.text());
}

async function buildConfig(state) {
  const [missionConfig, baseConfig, terrainObj] = await Promise.all([
    fetchYaml(`./data/deployment/${state.m}.yml`),
    fetchYaml("./data/base.yml"),
    fetchYaml("./data/terrain/gw.yml"),
  ]);
  missionConfig.hidden_supplies = state.hs;
  baseConfig.grid.draw = state.grid;
  return {
    deployment: missionConfig,
    base: baseConfig,
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

async function redraw() {
  const generation = ++renderGeneration;
  setStageMessage("Rendering…");
  try {
    const config = await buildConfig(controlState());
    if (generation !== renderGeneration) {
      return;
    }
    stage.replaceChildren();
    injectMissionCard(stage, config);
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
  };
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      downloadBlob(blob, `${filenameStem(controlState())}.png`);
    }, "image/png");
  };
  image.src = svgUrl;
  exportMenu.removeAttribute("open");
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

const initialState = readStateFromUrl();
missionSelector.value = initialState.m;
terrainSelector.value = initialState.t;
hiddenSupplies.checked = initialState.hs;
showGrid.checked = initialState.grid;
writeStateToUrl(initialState);
redraw();
