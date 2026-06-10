import { makeMissionCard } from "./main.js";
import { emptyScene, sceneToConfig, type Scene } from "./editor/scene.js";
import type { Template } from "./building-coordinates.js";
import { buildPaletteItems, renderPalette, createObjectFromPalette, type PaletteItem } from "./editor/palette.js";
import {
  renderOverlay,
  createOverlaySvg,
  objectCenter,
  type SelectionState,
} from "./editor/overlay.js";
import { renderInspector } from "./editor/inspector.js";
import { MISSIONS, TERRAIN_LAYOUTS, loadPreset } from "./editor/presets.js";
import { insertVertexAtEdge, deleteVertex } from "./editor/vertex-ops.js";

declare const jsyaml: { load(s: string): unknown; dump(v: unknown): string };

let scene: Scene = emptyScene();
let loadedTemplates: Record<string, Template> = {};
let rafId: number | null = null;
let snapEnabled = false;
let gridEnabled = false;

const canvasWrap = document.getElementById("canvas-wrap")!;
const statusBoard = document.getElementById("status-board")!;
const paletteEl = document.getElementById("palette")!;
const canvasArea = document.getElementById("canvas-area")!;

const inspEmptyEl = document.getElementById("insp-empty") as HTMLElement;
const inspBodyEl = document.getElementById("insp-body") as HTMLElement;
const inspChipEl = document.getElementById("insp-type-chip") as HTMLElement;
const statusSelEl = document.getElementById("status-selection") as HTMLElement;
const statusPreset = document.getElementById("status-preset") as HTMLElement;

const modalLoad = document.getElementById("modal-load") as HTMLElement;
const modalMission = document.getElementById("modal-mission") as HTMLSelectElement;
const modalTerrain = document.getElementById("modal-terrain") as HTMLSelectElement;

export function scheduleRender(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    renderCanvas();
  });
}

function renderCanvas(): void {
  const config = sceneToConfig(scene, loadedTemplates);
  if (gridEnabled) {
    config.base.grid = { draw: true };
  }
  const card = makeMissionCard(config);

  const area = canvasWrap.parentElement!.getBoundingClientRect();
  const aspect = scene.boardWidth / scene.boardHeight;
  const maxH = area.height - 40;
  const maxW = area.width - 40;
  const w = Math.min(maxW, maxH * aspect);
  const h = w / aspect;
  card.setAttribute("width", `${w}`);
  card.setAttribute("height", `${h}`);
  card.classList.add("map-svg");

  const existing = canvasWrap.querySelector("svg.map-svg");
  if (existing) {
    canvasWrap.replaceChild(card, existing);
  } else {
    canvasWrap.insertBefore(card, canvasWrap.firstChild);
  }

  if (!overlaySvg) {
    overlaySvg = createOverlaySvg(scene.boardWidth, scene.boardHeight);
    canvasWrap.appendChild(overlaySvg);
    attachOverlayEvents(overlaySvg);
  }
  overlaySvg.setAttribute("viewBox", `0 0 ${scene.boardWidth} ${scene.boardHeight}`);
  overlaySvg.setAttribute("width", card.getAttribute("width")!);
  overlaySvg.setAttribute("height", card.getAttribute("height")!);
  renderOverlay(overlaySvg, scene, sel, loadedTemplates);

  statusBoard.textContent = `${scene.boardWidth}×${scene.boardHeight} board`;
}

export function updateInspector(): void {
  renderInspector(
    inspEmptyEl,
    inspBodyEl,
    inspChipEl,
    scene,
    sel.selectedId,
    loadedTemplates,
    (id) => {
      scene.objects = scene.objects.filter((o) => o.id !== id);
      sel.selectedId = null;
      scheduleRender();
      updateInspector();
    },
    (id, patch) => {
      const idx = scene.objects.findIndex((o) => o.id === id);
      if (idx >= 0) {
        scene.objects[idx] = { ...scene.objects[idx], ...patch } as typeof scene.objects[number];
        scheduleRender();
      }
    },
    (patch) => {
      Object.assign(scene, patch);
      scheduleRender();
      updateInspector();
    },
  );
  updateStatus();
}

function updateStatus(): void {
  if (sel.vertexEditId) {
    statusSelEl.textContent = "Vertex edit · click + to add · right-click to delete";
  } else if (sel.selectedId) {
    statusSelEl.textContent = "1 object selected";
  } else {
    statusSelEl.textContent = "";
  }
}

/**
 * Converts client (screen) coordinates to board inches via the live map SVG.
 * Accepts anything with clientX/clientY, so both PointerEvent and DragEvent
 * (palette drop) share one conversion. Returns (0,0) when no map is rendered.
 */
function mapCoords(clientX: number, clientY: number): { x: number; y: number } {
  const mapSvg = canvasWrap.querySelector<SVGSVGElement>("svg.map-svg");
  if (!mapSvg) return { x: 0, y: 0 };
  const rect = mapSvg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * scene.boardWidth,
    y: ((clientY - rect.top) / rect.height) * scene.boardHeight,
  };
}

function attachOverlayEvents(svg: SVGSVGElement): void {
  svg.addEventListener("pointermove", (e) => {
    if (!canvasWrap.querySelector("svg.map-svg")) return;
    const { x, y } = mapCoords(e.clientX, e.clientY);
    document.getElementById("status-cursor")!.textContent =
      `cursor: ${x.toFixed(1)}″, ${y.toFixed(1)}″`;
  });

  svg.addEventListener("pointerdown", (e) => {
    const target = e.target as SVGElement & { dataset: DOMStringMap };
    const dataType = target.dataset?.type;
    const objectId = target.dataset?.objectId;

    if (dataType === "object" && objectId) {
      e.stopPropagation();
      if (
        sel.selectedId === objectId &&
        scene.objects.find((o) => o.id === objectId)?.type === "deployment-zone"
      ) {
        sel.vertexEditId = objectId;
        renderOverlay(svg, scene, sel, loadedTemplates);
        updateStatus();
        return;
      }
      sel.selectedId = objectId;
      sel.vertexEditId = null;
      renderOverlay(svg, scene, sel, loadedTemplates);
      updateInspector();
      startDrag(e, objectId);
      return;
    }

    if (dataType === "vertex" && objectId) {
      const vi = parseInt(target.dataset.vertexIndex ?? "", 10);
      if (isNaN(vi)) return;
      startVertexDrag(e, objectId, vi);
      return;
    }

    if (dataType === "edge-midpoint" && objectId) {
      const edgeIdx = parseInt(target.dataset.edgeIndex ?? "", 10);
      if (isNaN(edgeIdx)) return;
      const idx = scene.objects.findIndex((o) => o.id === objectId);
      if (idx < 0) return;
      const obj = scene.objects[idx];
      if (obj.type !== "deployment-zone") return;
      scene.objects[idx] = { ...obj, vertices: insertVertexAtEdge(obj.vertices, edgeIdx) };
      scheduleRender();
      startVertexDrag(e, objectId, edgeIdx + 1);
      return;
    }

    if (dataType === "rotate" && objectId) {
      startRotateDrag(e, objectId);
      return;
    }

    sel.selectedId = null;
    sel.vertexEditId = null;
    renderOverlay(svg, scene, sel, loadedTemplates);
    updateInspector();
  });

  svg.addEventListener("contextmenu", (e) => {
    const target = e.target as SVGElement & { dataset: DOMStringMap };
    if (target.dataset?.type !== "vertex") return;
    e.preventDefault();
    const vi = parseInt(target.dataset.vertexIndex ?? "", 10);
    const objectId = target.dataset.objectId;
    if (isNaN(vi) || !objectId) return;
    const idx = scene.objects.findIndex((o) => o.id === objectId);
    if (idx < 0) return;
    const obj = scene.objects[idx];
    if (obj.type !== "deployment-zone") return;
    const newVerts = deleteVertex(obj.vertices, vi);
    if (newVerts === obj.vertices) return;
    scene.objects[idx] = { ...obj, vertices: newVerts };
    scheduleRender();
  });
}

/**
 * Captures the pointer and runs a drag loop: `onMove` fires for every
 * pointermove until pointerup/pointercancel, then `onEnd` runs once and the
 * listeners are torn down. No-ops when no map is rendered. Returns whether
 * the drag actually started, so callers can skip per-drag setup.
 */
function startDragLoop(
  e: PointerEvent,
  onMove: (ev: PointerEvent) => void,
  onEnd?: () => void,
): void {
  if (!canvasWrap.querySelector("svg.map-svg")) return;
  canvasWrap.setPointerCapture(e.pointerId);
  const up = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onEnd?.();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

const snap = (v: number) => (snapEnabled ? Math.round(v) : v);

function startDrag(e: PointerEvent, id: string): void {
  const obj = scene.objects.find((o) => o.id === id);
  if (!obj) return;
  const start = mapCoords(e.clientX, e.clientY);
  const origX = obj.x;
  const origY = obj.y;

  startDragLoop(
    e,
    (ev) => {
      const pos = mapCoords(ev.clientX, ev.clientY);
      const idx = scene.objects.findIndex((o) => o.id === id);
      if (idx >= 0) {
        scene.objects[idx] = {
          ...scene.objects[idx],
          x: snap(origX + pos.x - start.x),
          y: snap(origY + pos.y - start.y),
        } as typeof scene.objects[number];
        scheduleRender();
      }
    },
    updateInspector,
  );
}
function startVertexDrag(e: PointerEvent, id: string, vi: number): void {
  startDragLoop(e, (ev) => {
    const { x: px, y: py } = mapCoords(ev.clientX, ev.clientY);
    const snappedX = snap(px);
    const snappedY = snap(py);
    const idx = scene.objects.findIndex((o) => o.id === id);
    if (idx < 0) return;
    const obj = scene.objects[idx];
    if (obj.type !== "deployment-zone") return;
    scene.objects[idx] = {
      ...obj,
      vertices: obj.vertices.map((v, i) => (i === vi ? { x: snappedX, y: snappedY } : v)),
    };
    scheduleRender();
  });
}
function startRotateDrag(e: PointerEvent, id: string): void {
  const obj = scene.objects.find((o) => o.id === id);
  if (!obj) return;
  const center = objectCenter(obj, loadedTemplates);

  const getAngle = (ev: PointerEvent): number => {
    const { x: px, y: py } = mapCoords(ev.clientX, ev.clientY);
    const raw = Math.atan2(py - center.y, px - center.x) * (180 / Math.PI) + 90;
    return ((raw % 360) + 360) % 360;
  };

  startDragLoop(
    e,
    (ev) => {
      const idx = scene.objects.findIndex((o) => o.id === id);
      if (idx >= 0) {
        scene.objects[idx] = { ...scene.objects[idx], rotation: getAngle(ev) } as typeof scene.objects[number];
        scheduleRender();
      }
    },
    updateInspector,
  );
}

async function fetchYaml(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return jsyaml.load(await res.text());
}

let overlaySvg: SVGSVGElement | null = null;
const sel: SelectionState = { selectedId: null, vertexEditId: null };

function initPalette(): void {
  const items = buildPaletteItems(loadedTemplates);
  renderPalette(paletteEl, items, (item, e) => {
    e.dataTransfer!.setData("text/plain", JSON.stringify(item));
  });

  canvasArea.addEventListener("dragover", (e) => e.preventDefault());
  canvasArea.addEventListener("drop", (e) => {
    e.preventDefault();
    const raw = e.dataTransfer?.getData("text/plain");
    if (!raw) return;
    const item = JSON.parse(raw) as PaletteItem;
    if (!canvasWrap.querySelector("svg.map-svg")) return;
    const { x: svgX, y: svgY } = mapCoords(e.clientX, e.clientY);
    scene.objects.push(createObjectFromPalette(item, svgX, svgY, scene));
    scheduleRender();
  });
}

async function start(): Promise<void> {
  try {
    const terrainData = (await fetchYaml("./data/terrain/gw.yml")) as {
      templates: Record<string, Template>;
    };
    loadedTemplates = terrainData.templates ?? {};
  } catch (e) {
    console.error("Failed to load terrain templates:", e);
  }

  document.getElementById("btn-snap")!.addEventListener("click", (e) => {
    snapEnabled = !snapEnabled;
    (e.currentTarget as HTMLElement).classList.toggle("active", snapEnabled);
  });

  document.getElementById("btn-grid")!.addEventListener("click", (e) => {
    gridEnabled = !gridEnabled;
    (e.currentTarget as HTMLElement).classList.toggle("active", gridEnabled);
    scheduleRender();
  });

  window.addEventListener("keydown", (e) => {
    const active = document.activeElement?.tagName;
    const inInput = active === "INPUT" || active === "TEXTAREA" || active === "SELECT";

    if (e.key === "Escape") {
      if (sel.vertexEditId) {
        sel.vertexEditId = null;
        if (overlaySvg) renderOverlay(overlaySvg, scene, sel, loadedTemplates);
        updateStatus();
      } else {
        sel.selectedId = null;
        sel.vertexEditId = null;
        if (overlaySvg) renderOverlay(overlaySvg, scene, sel, loadedTemplates);
        updateInspector();
      }
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && sel.selectedId && !inInput) {
      scene.objects = scene.objects.filter((o) => o.id !== sel.selectedId);
      sel.selectedId = null;
      sel.vertexEditId = null;
      scheduleRender();
      updateInspector();
      return;
    }

    if ((e.key === "r" || e.key === "R") && sel.selectedId && !inInput) {
      const idx = scene.objects.findIndex((o) => o.id === sel.selectedId);
      if (idx >= 0) {
        const cur = scene.objects[idx].rotation;
        scene.objects[idx] = {
          ...scene.objects[idx],
          rotation: (Math.round(cur / 90) * 90 + 90) % 360,
        } as typeof scene.objects[number];
        scheduleRender();
        updateInspector();
      }
    }
  });

  MISSIONS.forEach(({ id, label }) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    modalMission.appendChild(opt);
  });
  TERRAIN_LAYOUTS.forEach(({ id, label }) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    modalTerrain.appendChild(opt);
  });

  document.getElementById("btn-load")!.addEventListener("click", () => {
    modalLoad.hidden = false;
  });
  document.getElementById("modal-cancel")!.addEventListener("click", () => {
    modalLoad.hidden = true;
  });
  document.getElementById("modal-confirm")!.addEventListener("click", async () => {
    modalLoad.hidden = true;
    try {
      const { scene: partial, templates } = await loadPreset(
        modalMission.value,
        modalTerrain.value,
        fetchYaml,
      );
      loadedTemplates = templates;
      scene = { boardWidth: 60, boardHeight: 44, ...partial, objects: partial.objects ?? [] } as Scene;
      sel.selectedId = null;
      sel.vertexEditId = null;
      overlaySvg = null;
      while (canvasWrap.firstChild) canvasWrap.removeChild(canvasWrap.firstChild);
      statusPreset.textContent = `${modalMission.options[modalMission.selectedIndex].text} · Layout ${modalTerrain.value}`;
      initPalette();
      scheduleRender();
      updateInspector();
    } catch (err) {
      console.error("Failed to load preset:", err);
    }
  });

  const copyYamlBtn = document.getElementById("btn-copy-yaml")!;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  copyYamlBtn.addEventListener("click", async () => {
    const config = sceneToConfig(scene, loadedTemplates);
    const yaml = jsyaml.dump(config);
    try {
      await navigator.clipboard.writeText(yaml);
      copyYamlBtn.textContent = "Copied!";
    } catch {
      copyYamlBtn.textContent = "Copy failed";
    }
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyYamlBtn.textContent = "Copy YAML";
      copyTimer = null;
    }, 1500);
  });

  document.getElementById("btn-new")!.addEventListener("click", () => {
    if (!confirm("Start a new blank canvas? Unsaved work will be lost.")) return;
    scene = emptyScene();
    sel.selectedId = null;
    sel.vertexEditId = null;
    overlaySvg = null;
    while (canvasWrap.firstChild) canvasWrap.removeChild(canvasWrap.firstChild);
    statusPreset.textContent = "No preset loaded";
    scheduleRender();
    updateInspector();
  });

  scheduleRender();
  initPalette();
  window.addEventListener("resize", scheduleRender);
}

start();
