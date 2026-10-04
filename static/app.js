import {
  missions,
  controlElement,
  controlSpec,
  readControlsFromDom,
  setControlsLocked,
  writeControlsToDom,
  drawSnapshot,
  editorYaml,
  openSession,
  step,
  STORAGE_KEY,
  bindTabKeys,
  selectTab,
} from "./bundle.js";

// The Viewer session (mode, YAML text, derivation, what to store, what to
// render and where its outcome lands) lives in `src/viewer-session.ts`, the controls in
// `src/viewer-controls.ts` and the tabs' keyboard model in
// `src/viewer-tabs.ts`. This file only binds them to the page; the option
// labels are the one thing defined here.

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

// Throws naming the control if the markup lacks it, rather than returning
// null and failing later with a blank page.
const controlEls = controlSpec.map((row) => controlElement(document, row));

const stage = document.getElementById("stage");
const exportMenu = document.getElementById("export-menu");
const exportPngButton = document.getElementById("export-png");
const exportSvgButton = document.getElementById("export-svg");
const copyLinkButton = document.getElementById("copy-link");

const tablist = document.getElementById("editor-tabs");
const tabControls = document.getElementById("tab-controls");
const tabYaml = document.getElementById("tab-yaml");
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
  const select = controlElement(document, row);
  const label = OPTION_LABEL[row.key] ?? identity;
  for (const id of row.allowed) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label(id);
    select.appendChild(option);
  }
}

// The current Viewer session, as the last snapshot left it.
let session;
// The export filename (no extension), as the last snapshot named it.
let filenameStem;

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

// --- Snapshots ------------------------------------------------------------

function showStage(content) {
  if ("card" in content) {
    stage.replaceChildren(content.card);
  } else {
    setStageMessage(content.message, content.error);
  }
  setExportEnabled("card" in content);
}

function storeSession(text) {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Ignore: persistence is a convenience; storage may be disabled or full.
  }
}

function storedSession() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Write a whole snapshot back to the page. Every part is written every time,
// so nothing depends on the order events arrive in.
function show(snapshot) {
  session = snapshot.session;
  filenameStem = snapshot.filenameStem;
  const yamlMode = session.mode === "yaml";
  setControlsLocked(document, yamlMode);
  resetBanner.hidden = !yamlMode;
  // The URL cannot carry a YAML override, so Copy link is meaningless here.
  copyLinkButton.disabled = yamlMode;
  window.history.replaceState(
    null,
    "",
    snapshot.query ? `?${snapshot.query}` : window.location.pathname,
  );
  if (snapshot.stored !== null) {
    storeSession(snapshot.stored);
  }
  setYamlError(snapshot.yamlError);
  try {
    writeControlsToDom(document, session.controls);
  } catch (error) {
    showStage({ message: error.message, error: true });
    return;
  }
  const drawn = drawSnapshot(snapshot);
  setYamlError(drawn.yamlError);
  if (drawn.stage !== null) {
    showStage(drawn.stage);
  }
}

// --- Tabs -----------------------------------------------------------------

function openYamlTab() {
  setYamlError(null);
  try {
    // Null in yaml mode: the editor already holds the visitor's edits.
    const text = editorYaml(session);
    if (text !== null) {
      yamlEditor.value = text;
    }
  } catch (error) {
    setYamlError(error.message);
  }
}

function activateTab(name) {
  const isControls = name === "controls";
  selectTab(tablist, isControls ? tabControls : tabYaml);
  if (!isControls) {
    openYamlTab();
  }
}

// --- Event wiring ---------------------------------------------------------

for (const el of controlEls) {
  el.addEventListener("change", () => {
    show(
      step(session, {
        type: "controlsEdited",
        controls: readControlsFromDom(document),
      }),
    );
  });
}

let yamlRenderTimer;

yamlEditor.addEventListener("input", () => {
  show(step(session, { type: "yamlTyped", text: yamlEditor.value }));
  // Debounce the render.
  clearTimeout(yamlRenderTimer);
  yamlRenderTimer = setTimeout(() => {
    show(step(session, { type: "yamlSettled" }));
  }, 300);
});

resetButton.addEventListener("click", () => {
  clearTimeout(yamlRenderTimer);
  activateTab("controls");
  show(step(session, { type: "reset" }));
});
tabControls.addEventListener("click", () => activateTab("controls"));
tabYaml.addEventListener("click", () => activateTab("yaml"));
bindTabKeys(tablist, (tab) => activateTab(tab === tabControls ? "controls" : "yaml"));

// --- Export ---------------------------------------------------------------

function exportSvg() {
  const svg = stage.querySelector("svg");
  if (!svg) {
    return;
  }
  const markup = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([markup], { type: "image/svg+xml" });
  downloadBlob(blob, `${filenameStem}.svg`);
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
      downloadBlob(blob, `${filenameStem}.png`);
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
  const snapshot = openSession({
    search: window.location.search,
    saved: storedSession(),
  });
  const { mode, yaml } = snapshot.session;
  if (yaml !== null) {
    yamlEditor.value = yaml;
  }
  // Select only: the editor already holds what a yaml session restored.
  selectTab(tablist, mode === "yaml" ? tabYaml : tabControls);
  show(snapshot);
}

start();
