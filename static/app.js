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

async function getMissionConfig(missionName) {
  const response = await fetch(`./data/deployment/${missionName}.yml`);
  return jsyaml.load(await response.text());
}

async function getBaseConfig() {
  const response = await fetch("./data/base.yml");
  return jsyaml.load(await response.text());
}

async function getTerrain(terrainName) {
  const response = await fetch("./data/terrain/gw.yml");
  const obj = jsyaml.load(await response.text());
  return { ...obj, layout_name: terrainName };
}

const missionSelector = document.getElementById("mission");
const terrainSelector = document.getElementById("terrain");
const hiddenSupplies = document.getElementById("hidden-supplies");
const showGrid = document.getElementById("show-grid");
const stage = document.getElementById("stage");

function controlState() {
  return {
    m: missionSelector.value,
    t: terrainSelector.value,
    hs: hiddenSupplies.checked,
    grid: showGrid.checked,
  };
}

async function redraw() {
  const missionConfig = await getMissionConfig(missionSelector.value);
  const baseConfig = await getBaseConfig();
  const terrainConfig = await getTerrain(terrainSelector.value);

  missionConfig.hidden_supplies = hiddenSupplies.checked;
  baseConfig.grid.draw = showGrid.checked;

  const config = {
    deployment: missionConfig,
    base: baseConfig,
    terrain: terrainConfig,
  };

  stage.replaceChildren();
  injectMissionCard(stage, config);
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
