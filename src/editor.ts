/* global jsyaml */
import { makeMissionCard } from "./main.js";
import { emptyScene, sceneToConfig, type Scene } from "./editor/scene.js";
import type { Template } from "./building-coordinates.js";

declare const jsyaml: { load(s: string): unknown; dump(v: unknown): string };

let scene: Scene = emptyScene();
let loadedTemplates: Record<string, Template> = {};
let rafId: number | null = null;
let snapEnabled = false;
let gridEnabled = false;

const canvasWrap = document.getElementById("canvas-wrap")!;
const statusBoard = document.getElementById("status-board")!;
const statusPreset = document.getElementById("status-preset")!;

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

  statusBoard.textContent = `${scene.boardWidth}×${scene.boardHeight} board`;

  if (overlaySvg) {
    overlaySvg.setAttribute("width", `${w}`);
    overlaySvg.setAttribute("height", `${h}`);
    renderOverlayNow();
  }
}

// Stubs replaced in later tasks
function renderOverlayNow(): void { /* Task 8 */ }
export function updateInspector(): void { /* Task 9 */ }

async function fetchYaml(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return jsyaml.load(await res.text());
}

let overlaySvg: SVGSVGElement | null = null;

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
  window.addEventListener("resize", scheduleRender);
}

start();
