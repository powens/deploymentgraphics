import type { Template, Point } from "../building-coordinates.js";
import { MIRROR_DEFAULT } from "../placement.js";
import { DEFAULT_AREA_TERRAIN_SIZE } from "../terrain-config.js";
import type { Scene, SceneObject, ObjectiveObject, FeatureType } from "./scene.js";

export type PaletteItem =
  | { category: "building"; templateKey: string; label: string }
  | { category: "area-terrain"; shape: "circle" | "polygon"; label: string }
  | { category: "objective" }
  | { category: "deployment-zone"; player: "attacker" | "defender" }
  | { category: "annotation"; kind: "text" | "arrow" }
  | { category: "icon"; iconType: "skull" | "fortress"; label: string }
  | {
      category: "feature";
      featureType: FeatureType;
      width: number;
      height: number;
      color: string;
      label: string;
    };

const FIXED_ITEMS: PaletteItem[] = [
  { category: "area-terrain", shape: "circle", label: "Forest" },
  { category: "area-terrain", shape: "circle", label: "Crater" },
  { category: "area-terrain", shape: "circle", label: "Rubble" },
  { category: "icon", iconType: "skull", label: "Skull" },
  { category: "icon", iconType: "fortress", label: "Fortress" },
  { category: "objective" },
  { category: "deployment-zone", player: "attacker" },
  { category: "deployment-zone", player: "defender" },
  { category: "annotation", kind: "text" },
  { category: "annotation", kind: "arrow" },
  { category: "feature", featureType: "l-ruin", width: 3, height: 7, color: "stone", label: "L-ruin 3×7" },
  { category: "feature", featureType: "l-ruin", width: 5, height: 7, color: "stone", label: "L-ruin 5×7" },
  { category: "feature", featureType: "l-ruin-mirror", width: 5, height: 7, color: "stone", label: "L-ruin mirror" },
  { category: "feature", featureType: "l-ruin-roof", width: 5, height: 7, color: "green", label: "L-ruin roof" },
  { category: "feature", featureType: "l-ruin-roof-mirror", width: 5, height: 7, color: "green", label: "L-ruin roof mirror" },
  { category: "feature", featureType: "generator", width: 5, height: 3, color: "gunmetal", label: "Generator 5×3" },
  { category: "feature", featureType: "gantry", width: 5, height: 5, color: "gunmetal", label: "Gantry 5×5" },
  { category: "feature", featureType: "pipe", width: 6, height: 2, color: "rust", label: "Pipe (small)" },
  { category: "feature", featureType: "pipe", width: 10, height: 2.5, color: "rust", label: "Pipe (large)" },
];

const SECTION_LABELS: Record<string, string> = {
  building: "Buildings",
  "area-terrain": "Area Terrain",
  objective: "Objectives",
  "deployment-zone": "Deployment",
  annotation: "Annotations",
  icon: "Icons",
  feature: "Features",
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
  if (item.category === "icon") return item.iconType === "skull" ? "💀" : "🏰";
  if (item.category === "feature") return "▰";
  return item.kind === "text" ? "T" : "→";
}

function itemLabel(item: PaletteItem): string {
  if (item.category === "building") return item.label;
  if (item.category === "area-terrain") return item.label;
  if (item.category === "objective") return "Objective";
  if (item.category === "deployment-zone") return item.player === "attacker" ? "Attacker Zone" : "Defender Zone";
  if (item.category === "icon") return item.label;
  if (item.category === "feature") return item.label;
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
    return { id, type: "building", templateKey: item.templateKey, x, y, rotation: 0, mirror: MIRROR_DEFAULT };
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
    const verts: Point[] = item.player === "attacker"
      ? [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: 12 }, { x: 0, y: 12 }]
      : [{ x: 0, y: h - 12 }, { x: w, y: h - 12 }, { x: w, y: h }, { x: 0, y: h }];
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
  if (item.category === "icon") {
    return { id, type: "icon", iconType: item.iconType, x, y, rotation: 0 };
  }
  if (item.category === "feature") {
    return {
      id,
      type: "feature",
      featureType: item.featureType,
      x,
      y,
      rotation: 0,
      width: item.width,
      height: item.height,
      color: item.color,
      mirror: MIRROR_DEFAULT,
    };
  }
  const _exhaustive: never = item;
  throw new Error(`Unhandled PaletteItem category: ${(_exhaustive as { category: string }).category}`);
}
