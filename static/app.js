/* global jsyaml */
import { injectMissionCard } from "./bundle.js";

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

for (const el of [missionSelector, terrainSelector, hiddenSupplies, showGrid]) {
  el.addEventListener("change", redraw);
}

redraw();
