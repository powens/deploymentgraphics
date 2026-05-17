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

async function redraw() {
  setStageMessage("Rendering…");
  try {
    const config = await buildConfig(controlState());
    stage.replaceChildren();
    injectMissionCard(stage, config);
  } catch (error) {
    setStageMessage(error.message, true);
  }
}

function onControlChange() {
  writeStateToUrl(controlState());
  redraw();
}

for (const el of [missionSelector, terrainSelector, hiddenSupplies, showGrid]) {
  el.addEventListener("change", onControlChange);
}

const initialState = readStateFromUrl();
missionSelector.value = initialState.m;
terrainSelector.value = initialState.t;
hiddenSupplies.checked = initialState.hs;
showGrid.checked = initialState.grid;
writeStateToUrl(initialState);
redraw();
