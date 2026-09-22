import {
  makeMissionCard,
  buildConfig,
  baseConfig,
  missions,
  yaml,
  controlElement,
  controlSpec,
  controlsToSearch,
  deriveControls,
  initialControls,
  readControlsFromDom,
  terrainForTemplateSet,
  writeControlsToDom,
  writeDerivedControlsToDom,
} from "./bundle.js";
import { loadState, saveState } from "./state.js";

// Control defaults, allowlists, element ids and derivation all live in
// `src/viewer-controls.ts`; only the option labels are defined here.

function configFromControls(controls) {
  return buildConfig({
    mission: missions[controls.m],
    base: baseConfig,
    terrain: terrainForTemplateSet(controls.tpl),
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

// Throws naming the control if the markup lacks it, rather than returning
// null and failing later with a blank page.
function controlEl(key) {
  return controlElement(document, SPEC.get(key));
}

const controlEls = controlSpec.map((row) => controlEl(row.key));
// Changing these re-derives the deployment and terrain; other controls just
// re-render.
const derivedFromControls = ["da", "db", "lay"].map((key) => controlEl(key));

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

// Option values come from each row's allowlist (`staticOptions` rows carry
// theirs in index.html). Controls with no entry here are labelled by value.
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

// Which editor drives the render: "controls" or "yaml". The first YAML edit
// switches to "yaml".
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

// Rotate the card by ±90° inside the SVG (swap the viewBox, wrap content in a
// rotated group) rather than via CSS, so layout sizing and exports match the
// screen. The <title> stays a direct child for accessibility.
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

// Synchronous (presets are in memory), so no stale-render guard is needed.
function renderFromControls() {
  setExportEnabled(false);
  try {
    const controls = readControlsFromDom(document);
    const config = configFromControls(controls);
    // makeMissionCard builds off-DOM: a throw never blanks the stage.
    const card = rotateCard(makeMissionCard(config), Number(controls.rot));
    stage.replaceChildren(card);
    setExportEnabled(true);
  } catch (error) {
    setStageMessage(error.message, true);
  }
}

function renderFromYaml() {
  // Error paths leave the last good render on stage, still exportable.
  let config;
  try {
    config = yaml.load(yamlEditor.value);
  } catch (error) {
    setYamlError(error.message);
    return;
  }
  if (!config || typeof config !== "object") {
    setYamlError("YAML must describe a config object.");
    return;
  }
  try {
    // Build off-DOM first so a throw leaves the stage untouched.
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

function openYamlTab() {
  setYamlError(null);
  // In yaml mode the editor already holds the user's edits.
  if (mode === "yaml") {
    return;
  }
  // In controls mode, refill the editor with the current merged config.
  try {
    yamlEditor.value = yaml.dump(configFromControls(readControlsFromDom(document)));
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

// Re-derive the deployment and terrain dropdowns, then render; a derivation
// failure is reported on the stage.
function onDerivedControlChange() {
  try {
    writeDerivedControlsToDom(
      document,
      deriveControls(readControlsFromDom(document)),
    );
  } catch (error) {
    setExportEnabled(false);
    setStageMessage(error.message, true);
    return;
  }
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
  if (mode === "controls") {
    mode = "yaml";
    updateModeUi();
    syncUrl();
  }
  // Debounce re-render.
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

// Restore to a fixed label, not the live textContent, so a rapid second click
// cannot capture "Copied" as the label.
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
