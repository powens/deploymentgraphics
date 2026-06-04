import type { Template } from "../building-coordinates.js";
import { DEFAULT_AREA_TERRAIN_SIZE } from "../terrain-config.js";
import type { Scene, SceneObject, ObjectiveObject } from "./scene.js";

export type PaletteItem =
  | { category: "building"; templateKey: string; label: string }
  | { category: "area-terrain"; shape: "circle" | "polygon"; label: string }
  | { category: "objective" }
  | { category: "deployment-zone"; player: "attacker" | "defender" }
  | { category: "annotation"; kind: "text" | "arrow" };

const FIXED_ITEMS: PaletteItem[] = [
  { category: "area-terrain", shape: "circle", label: "Forest" },
  { category: "area-terrain", shape: "circle", label: "Crater" },
  { category: "area-terrain", shape: "circle", label: "Rubble" },
  { category: "objective" },
  { category: "deployment-zone", player: "attacker" },
  { category: "deployment-zone", player: "defender" },
  { category: "annotation", kind: "text" },
  { category: "annotation", kind: "arrow" },
];

const SECTION_LABELS: Record<string, string> = {
  building: "Buildings",
  "area-terrain": "Area Terrain",
  objective: "Objectives",
  "deployment-zone": "Deployment",
  annotation: "Annotations",
};

function itemIcon(item: PaletteItem): string {
  if (item.category === "building") return "▬";
  if (item.category === "area-terrain") {
    if (item.label === "Forest") return "🌲";
    if (item.label === "Crater") return "◎";
    return "⬡";
  }
  if (item.category === "objective") return "①";
  if (item.category === "deployment-zone") return item.player === "attacker" ? "🔴" : "🔵";
  return item.kind === "text" ? "T" : "→";
}

function itemLabel(item: PaletteItem): string {
  if (item.category === "building") return item.label;
  if (item.category === "area-terrain") return item.label;
  if (item.category === "objective") return "Objective";
  if (item.category === "deployment-zone") return item.player === "attacker" ? "Attacker Zone" : "Defender Zone";
  return item.kind === "text" ? "Text Label" : "Arrow";
}

export function buildPaletteItems(templates: Record<string, Template>): PaletteItem[] {
  const buildingItems: PaletteItem[] = Object.keys(templates).map((key) => ({
    category: "building" as const,
    templateKey: key,
    label: key.replace(/[-_]/g, " "),
  }));
  return [...buildingItems, ...FIXED_ITEMS];
}

export function renderPalette(
  container: HTMLElement,
  items: PaletteItem[],
  onDragStart: (item: PaletteItem, e: DragEvent) => void,
): void {
  while (container.firstChild) container.removeChild(container.firstChild);
  let currentSection = "";
  for (const item of items) {
    const cat = item.category;
    if (cat !== currentSection) {
      currentSection = cat;
      const head = document.createElement("div");
      head.className = "pal-section-head";
      head.textContent = SECTION_LABELS[cat] ?? cat;
      container.appendChild(head);
    }
    const el = document.createElement("div");
    el.className = "pal-item";
    el.draggable = true;
    const iconEl = document.createElement("div");
    iconEl.className = "pal-icon";
    iconEl.textContent = itemIcon(item);
    const labelEl = document.createElement("span");
    labelEl.textContent = itemLabel(item);
    el.appendChild(iconEl);
    el.appendChild(labelEl);
    el.addEventListener("dragstart", (e) => onDragStart(item, e as DragEvent));
    container.appendChild(el);
  }
}

export function createObjectFromPalette(
  item: PaletteItem,
  x: number,
  y: number,
  scene: Scene,
): SceneObject {
  const id = Math.random().toString(36).slice(2);
  if (item.category === "building") {
    return { id, type: "building", templateKey: item.templateKey, x, y, rotation: 0, mirror: true };
  }
  if (item.category === "area-terrain") {
    return {
      id, type: "area-terrain", shape: item.shape, x, y, rotation: 0,
      width: DEFAULT_AREA_TERRAIN_SIZE, height: DEFAULT_AREA_TERRAIN_SIZE,
      label: item.label,
    };
  }
  if (item.category === "objective") {
    const used = new Set(
      scene.objects
        .filter((o): o is ObjectiveObject => o.type === "objective")
        .map((o) => o.number),
    );
    let n = 1;
    while (used.has(n)) n++;
    return { id, type: "objective", number: n, x, y, rotation: 0 };
  }
  if (item.category === "deployment-zone") {
    const w = scene.boardWidth;
    const h = scene.boardHeight;
    const verts: [number, number][] = item.player === "attacker"
      ? [[0, 0], [w, 0], [w, 12], [0, 12]]
      : [[0, h - 12], [w, h - 12], [w, h], [0, h]];
    return { id, type: "deployment-zone", player: item.player, vertices: verts, x: 0, y: 0, rotation: 0 };
  }
  if (item.category === "annotation") {
    return {
      id, type: "annotation", kind: item.kind, x, y, rotation: 0,
      text: item.kind === "text" ? "Label" : undefined,
      endX: item.kind === "arrow" ? x + 5 : undefined,
      endY: item.kind === "arrow" ? y + 5 : undefined,
    };
  }
  const _exhaustive: never = item;
  throw new Error(`Unhandled PaletteItem category: ${(_exhaustive as { category: string }).category}`);
}
