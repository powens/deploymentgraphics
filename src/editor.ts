import { makeMissionCard } from "./main.js";
import { emptyScene, sceneToConfig, type Scene } from "./editor/scene.js";
import type { Template } from "./building-coordinates.js";
import { buildPaletteItems, renderPalette, createObjectFromPalette, type PaletteItem } from "./editor/palette.js";
import {
  renderOverlay,
  createOverlaySvg,
  type SelectionState,
} from "./editor/overlay.js";
import { renderInspector } from "./editor/inspector.js";

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
    config.base.grid = {
      draw: true,
      svg_properties: { opacity: 0.3, stroke: "black", stroke_width: 0.15, stroke_dasharray: "0.1 0.1" },
    };
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
  );
  statusSelEl.textContent = sel.selectedId ? "1 object selected" : "";
}

function attachOverlayEvents(svg: SVGSVGElement): void {
  svg.addEventListener("pointermove", (e) => {
    const mapSvg = canvasWrap.querySelector<SVGSVGElement>("svg.map-svg");
    if (!mapSvg) return;
    const rect = mapSvg.getBoundingClientRect();
    const x = (((e.clientX - rect.left) / rect.width) * scene.boardWidth).toFixed(1);
    const y = (((e.clientY - rect.top) / rect.height) * scene.boardHeight).toFixed(1);
    document.getElementById("status-cursor")!.textContent = `cursor: ${x}″, ${y}″`;
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

    if (dataType === "rotate" && objectId) {
      startRotateDrag(e, objectId);
      return;
    }

    sel.selectedId = null;
    sel.vertexEditId = null;
    renderOverlay(svg, scene, sel, loadedTemplates);
    updateInspector();
  });
}

function startDrag(e: PointerEvent, id: string): void {
  const obj = scene.objects.find((o) => o.id === id);
  if (!obj) return;
  const mapSvg = canvasWrap.querySelector<SVGSVGElement>("svg.map-svg");
  if (!mapSvg) return;

  const toSvgCoords = (ev: PointerEvent) => {
    const rect = mapSvg.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * scene.boardWidth,
      y: ((ev.clientY - rect.top) / rect.height) * scene.boardHeight,
    };
  };
  const snap = (v: number) => (snapEnabled ? Math.round(v) : v);
  const start = toSvgCoords(e);
  const origX = obj.x;
  const origY = obj.y;

  function onMove(ev: PointerEvent) {
    const pos = toSvgCoords(ev);
    const idx = scene.objects.findIndex((o) => o.id === id);
    if (idx >= 0) {
      scene.objects[idx] = {
        ...scene.objects[idx],
        x: snap(origX + pos.x - start.x),
        y: snap(origY + pos.y - start.y),
      } as typeof scene.objects[number];
      scheduleRender();
    }
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    updateInspector();
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
function startVertexDrag(e: PointerEvent, id: string, vi: number): void { void e; void id; void vi; /* Task 11 */ }
function startRotateDrag(e: PointerEvent, id: string): void { void e; void id; /* Task 10 */ }

async function fetchYaml(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return jsyaml.load(await res.text());
}

let overlaySvg: SVGSVGElement | null = null;
const sel: SelectionState = { selectedId: null, vertexEditId: null, dragVertexIndex: null };

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
    const mapSvg = canvasWrap.querySelector<SVGSVGElement>("svg.map-svg");
    if (!mapSvg) return;
    const rect = mapSvg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * scene.boardWidth;
    const svgY = ((e.clientY - rect.top) / rect.height) * scene.boardHeight;
    scene.objects.push(createObjectFromPalette(item, svgX, svgY, scene));
    scheduleRender();
  });
}

// Exported for read-access by other editor modules.
// Mutate via: scene.objects.push/splice/etc. (in-place mutation on the scene object itself).
// Do NOT try to reassign the exported binding from another module — use scheduleRender() after any mutation.
export { scene, loadedTemplates, snapEnabled, overlaySvg, fetchYaml };

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

  scheduleRender();
  initPalette();
  window.addEventListener("resize", scheduleRender);
}

start();
