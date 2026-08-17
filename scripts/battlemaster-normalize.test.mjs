import { describe, it, expect } from "vitest";
import { normalizeLayout } from "./battlemaster-normalize.mjs";

// A minimal stand-in for the vendored data: one composite whose footprint is
// byte-identical to `area-short-line` (so VARIANT is identity), carrying two
// parts - one that needs a chirality flip and one that does not.
const templatesById = new Map([
  [
    "bm-bm-terrain-11e-1-composite-30-m0-p0",
    {
      id: "bm-bm-terrain-11e-1-composite-30-m0-p0",
      name: "Battlemaster SL 30",
      kind: "area",
      footprint: { type: "polygon", points: [] },
      features: [
        {
          id: "feature-1",
          template: "bm-bm-terrain-11e-1-part-small-l",
          position: { x: 1.5, y: -0.25 },
          rotation_degrees: 90,
        },
        {
          id: "feature-2",
          template: "bm-bm-terrain-11e-1-part-tower",
          position: { x: -1.5, y: 0.25 },
        },
      ],
    },
  ],
]);

const layoutWith = (piece) => ({
  id: "fixture",
  mission_matchup_id: "m",
  pieces: [{ id: "area-01", name: "Battlemaster area 01", piece_type: "area",
             template: "bm-bm-terrain-11e-1-composite-30-m0-p0",
             position: { x: 10, y: 20 }, ...piece }],
});

describe("normalizeLayout", () => {
  it("rewrites the area onto its legacy archetype", () => {
    const out = normalizeLayout(layoutWith({ rotation_degrees: 90 }), templatesById);
    const area = out.pieces.find((p) => p.piece_type === "area");
    expect(area.template).toBe("area-short-line");
    expect(area.position).toEqual({ x: 10, y: 20 });
    expect(area.rotation_degrees).toBe(90);
    expect("mirror" in area).toBe(false);
    expect(area.id).toBe("area-01");
  });

  it("emits one parented feature child per composite part", () => {
    const out = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    const kids = out.pieces.filter((p) => p.piece_type === "feature");
    expect(kids.map((k) => k.id)).toEqual([
      "area-01-feature-1",
      "area-01-feature-2",
    ]);
    expect(kids.map((k) => k.template)).toEqual(["corner-short", "gantry"]);
    for (const k of kids) expect(k.parent_area_id).toBe("area-01");
    expect(kids[0].position).toEqual({ x: 1.5, y: -0.25 });
    expect(kids[1].rotation_degrees).toBe(0);
  });

  it("mirrors a flip-bit part so its handedness is fixed", () => {
    // small-l has flip:true and the parent is unmirrored, so K must be improper.
    const plain = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    expect(plain.pieces[1].mirror).toBe("horizontal");
    // tower has flip:false, so K is the identity.
    expect("mirror" in plain.pieces[2]).toBe(false);
  });

  it("cancels the parent's parity so handedness survives a mirrored area", () => {
    // Parent mirrored => det(M) = -1, so small-l's K flips back to proper and
    // tower's K becomes improper. Each part keeps its absolute handedness.
    const out = normalizeLayout(
      layoutWith({ rotation_degrees: 0, mirror: "horizontal" }),
      templatesById,
    );
    expect("mirror" in out.pieces[1]).toBe(false);
    expect(out.pieces[2].mirror).toBe("horizontal");
  });

  it("folds a registered rigid variant into the area's own transform", () => {
    const trTemplates = new Map([
      [
        "bm-bm-terrain-11e-1-composite-23-m1-p2",
        {
          id: "bm-bm-terrain-11e-1-composite-23-m1-p2",
          name: "Battlemaster TR 23",
          footprint: { type: "polygon", points: [] },
          features: [],
        },
      ],
    ]);
    const out = normalizeLayout(
      {
        id: "fixture",
        pieces: [{ id: "area-01", piece_type: "area",
                   template: "bm-bm-terrain-11e-1-composite-23-m1-p2",
                   position: { x: 0, y: 0 }, rotation_degrees: 30 }],
      },
      trTemplates,
    );
    // V is a 180-degree rotation, so it lands entirely in rotation_degrees.
    expect(out.pieces[0].template).toBe("area-trapezoid");
    expect(out.pieces[0].rotation_degrees).toBe(210);
    expect("mirror" in out.pieces[0]).toBe(false);
  });

  it("passes a layout with no composite pieces through untouched", () => {
    const layout = {
      id: "legacy",
      pieces: [{ id: "a", piece_type: "area", template: "area-large",
                 position: { x: 1, y: 2 } }],
    };
    expect(normalizeLayout(layout, new Map()).pieces).toEqual(layout.pieces);
  });

  it("throws on an unmapped part", () => {
    const bad = new Map([
      ["bm-bm-terrain-11e-1-composite-30-m0-p0", {
        id: "bm-bm-terrain-11e-1-composite-30-m0-p0",
        name: "Battlemaster SL 30",
        features: [{ id: "f", template: "bm-bm-terrain-11e-1-part-obelisk",
                     position: { x: 0, y: 0 } }],
      }],
    ]);
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), bad),
    ).toThrow(/obelisk/);
  });
});
