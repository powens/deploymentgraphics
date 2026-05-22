import { templateBounds } from "../building-coordinates.js";
import type { Template } from "../building-coordinates.js";
import type { Scene, SceneObject, DeploymentZoneObject } from "./scene.js";

export type SelectionState = {
  selectedId: string | null;
  vertexEditId: string | null;
  dragVertexIndex: number | null;
};

export function objectBounds(
  obj: SceneObject,
  templates: Record<string, Template>,
): { x: number; y: number; w: number; h: number } {
  if (obj.type === "building") {
    const t = templates[obj.templateKey];
    const size = t ? templateBounds(t, obj.templateKey) : { width: 4, height: 4 };
    return { x: obj.x, y: obj.y, w: size.width, h: size.height };
  }
  if (obj.type === "area-terrain") {
    return { x: obj.x, y: obj.y, w: obj.width ?? 6, h: obj.height ?? obj.width ?? 6 };
  }
  if (obj.type === "objective") {
    return { x: obj.x - 1.5, y: obj.y - 1.5, w: 3, h: 3 };
  }
  if (obj.type === "deployment-zone") {
    if (obj.vertices.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = obj.vertices.map(([vx]) => vx);
    const ys = obj.vertices.map(([, vy]) => vy);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: obj.x - 1, y: obj.y - 1, w: 8, h: 3 };
}

export function objectCenter(
  obj: SceneObject,
  templates: Record<string, Template>,
): { x: number; y: number } {
  const b = objectBounds(obj, templates);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag) as SVGElement;
}

export function renderOverlay(
  overlaySvg: SVGSVGElement,
  scene: Scene,
  sel: SelectionState,
  templates: Record<string, Template>,
): void {
  while (overlaySvg.firstChild) overlaySvg.removeChild(overlaySvg.firstChild);

  for (const obj of scene.objects) {
    if (obj.type === "deployment-zone" && sel.vertexEditId === obj.id) {
      const n = obj.vertices.length;
      // Midpoint handles rendered first (lower z-order)
      for (let i = 0; i < n; i++) {
        const [vx, vy] = obj.vertices[i];
        const [nx, ny] = obj.vertices[(i + 1) % n];
        const mid = svgEl("circle") as SVGCircleElement;
        mid.setAttribute("cx", `${(vx + nx) / 2}`);
        mid.setAttribute("cy", `${(vy + ny) / 2}`);
        mid.setAttribute("r", "0.65");
        mid.setAttribute("fill", "#b9842f");
        mid.setAttribute("stroke", "white");
        mid.setAttribute("stroke-width", "0.15");
        mid.setAttribute("stroke-dasharray", "0.3 0.2");
        mid.style.pointerEvents = "all";
        mid.style.cursor = "crosshair";
        mid.dataset.type = "edge-midpoint";
        mid.dataset.objectId = obj.id;
        mid.dataset.edgeIndex = `${i}`;
        overlaySvg.appendChild(mid);
      }
      // Vertex handles rendered second (higher z-order)
      for (let i = 0; i < n; i++) {
        const [vx, vy] = obj.vertices[i];
        const handle = svgEl("circle") as SVGCircleElement;
        handle.setAttribute("cx", `${vx}`);
        handle.setAttribute("cy", `${vy}`);
        handle.setAttribute("r", "1");
        handle.setAttribute("fill", "#b9842f");
        handle.setAttribute("stroke", "white");
        handle.setAttribute("stroke-width", "0.2");
        handle.style.pointerEvents = "all";
        handle.style.cursor = "move";
        handle.dataset.type = "vertex";
        handle.dataset.objectId = obj.id;
        handle.dataset.vertexIndex = `${i}`;
        overlaySvg.appendChild(handle);
      }
      continue;
    }

    const b = objectBounds(obj, templates);

    const wrapper = svgEl("g");
    if (obj.type !== "deployment-zone" && obj.rotation !== 0) {
      wrapper.setAttribute("transform", `rotate(${obj.rotation}, ${obj.x}, ${obj.y})`);
    }
    overlaySvg.appendChild(wrapper);

    let hitEl: SVGElement;

    if (obj.type === "deployment-zone") {
      hitEl = svgEl("polygon");
      const pts = (obj as DeploymentZoneObject).vertices
        .map(([vx, vy]) => `${vx},${vy}`)
        .join(" ");
      hitEl.setAttribute("points", pts);
      hitEl.setAttribute("fill", "transparent");
    } else {
      hitEl = svgEl("rect");
      hitEl.setAttribute("x", `${b.x}`);
      hitEl.setAttribute("y", `${b.y}`);
      hitEl.setAttribute("width", `${b.w}`);
      hitEl.setAttribute("height", `${b.h}`);
      hitEl.setAttribute("fill", "transparent");
    }
    hitEl.style.pointerEvents = "all";
    hitEl.style.cursor = "move";
    hitEl.dataset.type = "object";
    hitEl.dataset.objectId = obj.id;
    wrapper.appendChild(hitEl);

    if (sel.selectedId === obj.id) {
      const box = svgEl("rect");
      box.setAttribute("x", `${b.x - 0.3}`);
      box.setAttribute("y", `${b.y - 0.3}`);
      box.setAttribute("width", `${b.w + 0.6}`);
      box.setAttribute("height", `${b.h + 0.6}`);
      box.setAttribute("fill", "rgba(185,132,47,0.06)");
      box.setAttribute("stroke", "#b9842f");
      box.setAttribute("stroke-width", "0.25");
      box.setAttribute("stroke-dasharray", "0.8 0.4");
      box.style.pointerEvents = "none";
      wrapper.appendChild(box);

      const cx = b.x + b.w / 2;
      const stem = svgEl("line");
      stem.setAttribute("x1", `${cx}`);
      stem.setAttribute("y1", `${b.y}`);
      stem.setAttribute("x2", `${cx}`);
      stem.setAttribute("y2", `${b.y - 2.5}`);
      stem.setAttribute("stroke", "#b9842f");
      stem.setAttribute("stroke-width", "0.2");
      wrapper.appendChild(stem);

      const rotHandle = svgEl("circle") as SVGCircleElement;
      rotHandle.setAttribute("cx", `${cx}`);
      rotHandle.setAttribute("cy", `${b.y - 2.5}`);
      rotHandle.setAttribute("r", "1");
      rotHandle.setAttribute("fill", "#b9842f");
      rotHandle.style.pointerEvents = "all";
      rotHandle.style.cursor = "grab";
      rotHandle.dataset.type = "rotate";
      rotHandle.dataset.objectId = obj.id;
      wrapper.appendChild(rotHandle);
    }
  }
}

export function createOverlaySvg(boardWidth: number, boardHeight: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${boardWidth} ${boardHeight}`);
  svg.classList.add("overlay");
  svg.style.pointerEvents = "none";
  return svg;
}
