// @vitest-environment happy-dom
//
// CHARACTERIZATION GATE for the origin-pivot -> centre-pivot building switch.
//
// The building <use> transform STRING changes shape when buildings move from
// `translate(tx ty) rotate(deg)` (rotation about the template origin) to
// `translate(x y) rotate(deg cx cy)` (rotation about the box centre). The
// rendered GEOMETRY must not. This test reads whatever transform makeBuildings
// emits, evaluates it on each template's distinctive local points (bbox corners
// plus polygon vertices, so a nubbin that pokes past the declared box is
// covered), and snapshots the ABSOLUTE canvas positions. Pixel-identity holds
// iff this snapshot is unchanged across the refactor.
import { describe, it, expect } from "vitest";
import { makeBuildings } from "./buildings";
import { templateBounds, type Template } from "./building-coordinates";

const canvas = { width: 60, height: 44 };

// A polygon whose geometry pokes past its declared 4x6 box (nubbin to x=5),
// so the characterization exercises a point outside the placement box under
// rotation and mirroring.
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
 * Parse an SVG transform of the form `translate(a b) rotate(deg[ cx cy])` into
 * a function mapping a local point to its absolute canvas position. Handles
 * BOTH the origin-pivot (no cx/cy) and centre-pivot (cx/cy) forms.
 */
function evalTransform(transform: string): (p: { x: number; y: number }) => { x: number; y: number } {
  const tr = /translate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(transform);
  const ro = /rotate\(\s*(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?\s*\)/.exec(transform);
  if (!tr || !ro) throw new Error(`unparsable transform: ${transform}`);
  const tx = +tr[1], ty = +tr[2];
  const deg = +ro[1];
  const cx = ro[2] !== undefined ? +ro[2] : 0;
  const cy = ro[3] !== undefined ? +ro[3] : 0;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return (p) => {
    // rotate about (cx,cy), then translate
    const dx = p.x - cx, dy = p.y - cy;
    const rxp = cx + dx * cos - dy * sin;
    const ryp = cy + dx * sin + dy * cos;
    return { x: tx + rxp, y: ty + ryp };
  };
}

/** Render placements, return absolute positions of every tracked local point. */
function absolutePoints(placements: Parameters<typeof makeBuildings>[0]): string[] {
  const group = makeBuildings(placements, templates, canvas);
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

describe("building geometry is pivot-invariant (characterization gate)", () => {
  it("axis-aligned, rotated, nubbin, and mirrored buildings land at fixed canvas points", () => {
    const placements: Parameters<typeof makeBuildings>[0] = [
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
