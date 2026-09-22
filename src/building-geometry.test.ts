// @vitest-environment happy-dom
//
// Evaluates each rendered building's transform on its template's local points
// and snapshots the absolute canvas positions, so anything that moves a
// building (placement or mirroring) shows up as a snapshot diff.
import { describe, it, expect } from "vitest";
import { makeBuildings } from "./buildings";
import { baseTheme } from "./presets/theme.js";
import { templateBounds, type Template } from "./building-coordinates";
import { browserSvgDocument, type SvgNode } from "./svg-backend.js";

const doc = browserSvgDocument();
// The browser backend's `SvgNode`s are real DOM nodes.
const asElement = (node: SvgNode) => node as unknown as SVGElement;

const canvas = { width: 60, height: 44 };

// Geometry pokes past its declared 4x6 box (nubbin to x=5), to cover a point
// outside the placement box under rotation and mirroring.
const nub: Template = {
  width: 4,
  height: 6,
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2.5 },
    { x: 5, y: 3 },
    { x: 4, y: 3.5 },
    { x: 4, y: 6 },
    { x: 0, y: 6 },
  ],
};

const templates: Record<string, Template> = {
  "4x6": { width: 4, height: 6 },
  "3x4": { width: 3, height: 4 },
  nub,
};

/** Local points to track per template: polygon vertices, else the bbox corners. */
function localPoints(name: string): { x: number; y: number }[] {
  const t = templates[name];
  if ("points" in t) return t.points;
  const { width, height } = templateBounds(t, name);
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/**
 * Parses `translate(a b) rotate(deg cx cy)` into a local-to-canvas point map.
 * Whole-string match with the pivot required, so a pivot-less rotate or an
 * extra component (e.g. `scale`) throws rather than being silently ignored.
 */
function evalTransform(transform: string): (p: { x: number; y: number }) => { x: number; y: number } {
  const m =
    /^translate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)\s*rotate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/.exec(
      transform,
    );
  if (!m) throw new Error(`unparsable transform: ${transform}`);
  const tx = +m[1], ty = +m[2];
  const deg = +m[3];
  const cx = +m[4];
  const cy = +m[5];
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return (p) => {
    const dx = p.x - cx, dy = p.y - cy;
    const rxp = cx + dx * cos - dy * sin;
    const ryp = cy + dx * sin + dy * cos;
    return { x: tx + rxp, y: ty + ryp };
  };
}

/** Render placements, return absolute positions of every tracked local point. */
function absolutePoints(placements: Parameters<typeof makeBuildings>[1]): string[] {
  const group = asElement(makeBuildings(doc, placements, templates, canvas, baseTheme));
  const out: string[] = [];
  for (const use of Array.from(group.querySelectorAll("use"))) {
    const href = use.getAttribute("href") ?? "";
    const name = href.replace("#template-", "");
    const apply = evalTransform(use.getAttribute("transform") ?? "");
    const abs = localPoints(name).map((p) => {
      const a = apply(p);
      return `(${a.x.toFixed(3)}, ${a.y.toFixed(3)})`;
    });
    out.push(`${use.getAttribute("id")} ${name}: ${abs.join(" ")}`);
  }
  return out;
}

describe("rendered building geometry", () => {
  it("axis-aligned, rotated, nubbin, and mirrored buildings land at fixed canvas points", () => {
    const placements: Parameters<typeof makeBuildings>[1] = [
      // axis-aligned single corner, mirror on
      { type: "4x6", corners: { TL: { x: 10, y: 5 } } },
      // 90-degree rotation via a diagonal corner pair, mirror on
      { type: "3x4", corners: { TL: { x: 20, y: 10 }, BR: { x: 16, y: 13 } } },
      // polygon with a nubbin, rotated 90 degrees, mirror on
      { type: "nub", corners: { TL: { x: 30, y: 8 }, TR: { x: 30, y: 12 } } },
      // anchored from a non-default canvas corner, mirror off
      { type: "4x6", mirror: false, corners: { TL: { x: 10, y: 5, from: "TR" } } },
    ];
    expect(absolutePoints(placements)).toMatchInlineSnapshot(`
      [
        "building-0 4x6: (10.000, 5.000) (14.000, 5.000) (14.000, 11.000) (10.000, 11.000)",
        "building-1 4x6: (50.000, 39.000) (46.000, 39.000) (46.000, 33.000) (50.000, 33.000)",
        "building-2 3x4: (20.000, 10.000) (20.000, 13.000) (16.000, 13.000) (16.000, 10.000)",
        "building-3 3x4: (40.000, 34.000) (40.000, 31.000) (44.000, 31.000) (44.000, 34.000)",
        "building-4 nub: (30.000, 8.000) (30.000, 12.000) (27.500, 12.000) (27.000, 13.000) (26.500, 12.000) (24.000, 12.000) (24.000, 8.000)",
        "building-5 nub: (30.000, 36.000) (30.000, 32.000) (32.500, 32.000) (33.000, 31.000) (33.500, 32.000) (36.000, 32.000) (36.000, 36.000)",
        "building-6 4x6: (50.000, 5.000) (54.000, 5.000) (54.000, 11.000) (50.000, 11.000)",
      ]
    `);
  });
});
