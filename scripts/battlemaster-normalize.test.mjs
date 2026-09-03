import { describe, it, expect } from "vitest";
import {
  normalizeLayout,
  partAnchorShift,
  partExtent,
  pieceMatrix,
} from "./battlemaster-normalize.mjs";
import { matvec } from "../src/geometry.ts";

// A minimal stand-in for the vendored data: one composite whose footprint is
// byte-identical to `area-short-line` (so VARIANT is identity), carrying two
// parts - one that needs a chirality flip and one that does not - plus the two
// legacy templates they map onto, which normalizeLayout reads to compute each
// child's anchor offset. Both footprints are copied verbatim from
// terrain-templates.json.
//
// The upstream parts here carry a bare `footprint` and no `walls`, which is the
// pre-battlemaster-11e shape of the data. partExtent falls back to `footprint`
// and partAnchorShift to zero for such a part, so these fixtures go on
// exercising the mapping rules (F, Z, K, Q, S) in isolation. The `walls` path
// those two functions exist for is pinned separately at the end of this file.
const templatesById = new Map([
  [
    "corner-short",
    {
      id: "corner-short",
      // An L: 2x3 bbox with 0.5in arms. Z resizes it onto upstream's 1.5x2.5
      // (turn 180, so no axis swap) by moving each axis's far side only, giving
      // a 1.5x2.5 L with the same 0.5in arms, whose area centroid then sits
      // (-0.3125, -0.3125) inside its bbox centre. That offset is what the
      // child's `position` must absorb.
      footprint: {
        type: "polygon",
        points: [
          { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0.5 },
          { x: 0.5, y: 0.5 }, { x: 0.5, y: 3 }, { x: 0, y: 3 },
        ],
      },
    },
  ],
  [
    "bm-part-small-l-a5777aceb2",
    {
      id: "bm-part-small-l-a5777aceb2",
      footprint: { type: "rectangle", width: 1.5, height: 2.5 },
    },
  ],
  // A rectangle: centroid and bbox centre coincide, so its anchor offset is 0.
  // `tower` takes upstream's footprint (2x2.5) over this one, so both are here.
  ["gantry", { id: "gantry", footprint: { type: "rectangle", width: 2, height: 2 } }],
  [
    "bm-part-tower-ddab4cb687",
    {
      id: "bm-part-tower-ddab4cb687",
      footprint: { type: "rectangle", width: 2, height: 2.5 },
    },
  ],
  // The legacy generator is 3x4 and Battlemaster's part is 4.5x2 - a different
  // model, not a re-drawing - so `generator` is the one part that carries
  // upstream's own footprint through onto the child. Both copied verbatim from
  // terrain-templates.json.
  ["generator", { id: "generator", footprint: { type: "rectangle", width: 3, height: 4 } }],
  [
    "bm-part-generator-2aeba08b62",
    {
      id: "bm-part-generator-2aeba08b62",
      footprint: { type: "rectangle", width: 4.5, height: 2 },
    },
  ],
  [
    "bm-composite-shortline-31-bbbbbbbbbb",
    {
      id: "bm-composite-shortline-31-bbbbbbbbbb",
      name: "Battlemaster ShortLine 31",
      kind: "area",
      footprint: { type: "polygon", points: [] },
      features: [
        {
          id: "feature-1",
          template: "bm-part-generator-2aeba08b62",
          position: { x: 2, y: -1 },
          rotation_degrees: 90,
        },
      ],
    },
  ],
  [
    "bm-composite-shortline-30-aaaaaaaaaa",
    {
      id: "bm-composite-shortline-30-aaaaaaaaaa",
      name: "Battlemaster ShortLine 30",
      kind: "area",
      footprint: { type: "polygon", points: [] },
      features: [
        {
          id: "feature-1",
          template: "bm-part-small-l-a5777aceb2",
          position: { x: 1.5, y: -0.25 },
          rotation_degrees: 90,
        },
        {
          id: "feature-2",
          template: "bm-part-tower-ddab4cb687",
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
             template: "bm-composite-shortline-30-aaaaaaaaaa",
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
    expect(kids[1].rotation_degrees).toBe(0);
  });

  it("re-anchors an L-shaped part by its centroid-to-bbox offset", () => {
    const out = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    const [lRuin, tower] = out.pieces.filter((p) => p.piece_type === "feature");
    // small-l is flip:true under an unmirrored parent (K = FLIP_X) and turn:180,
    // so A = R(90) . FLIP_X . R(180) = [[0, 1], [1, 0]], which maps the anchor
    // offset onto itself. The offset is read off the *resized* polygon (Z), the
    // 1.5x2.5 L with 0.5in arms: area 1.75, centroid (13/28, 27/28), bbox centre
    // (0.75, 1.25), so the offset is (-2/7, -2/7). It was (-5/12, -5/12) off the
    // unresized 2x3 L.
    expect(lRuin.position.x).toBeCloseTo(1.5 - 2 / 7, 10);
    expect(lRuin.position.y).toBeCloseTo(-0.25 - 2 / 7, 10);
    // tower is a rectangle, so its centroid is its bbox centre and upstream's
    // position carries through untouched.
    expect(tower.position).toEqual({ x: -1.5, y: 0.25 });
  });

  it("carries upstream's own footprint for the tower part", () => {
    const out = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    const tower = out.pieces[2];
    // Upstream's 2x2.5, not the legacy gantry's 2x2. Neither footprint says
    // anything the other doesn't beyond its size, so upstream's wins.
    expect(tower.template).toBe("gantry");
    expect(tower.footprint).toEqual({ type: "rectangle", width: 2, height: 2.5 });
  });

  it("carries upstream's own footprint for the generator part", () => {
    const out = normalizeLayout(
      layoutWith({
        template: "bm-composite-shortline-31-bbbbbbbbbb",
        rotation_degrees: 0,
      }),
      templatesById,
    );
    const gen = out.pieces[1];
    // Upstream's 4.5x2, not the legacy 3x4 the template id names. The id stays
    // so rect-to-feature.mjs still types and colours it as a generator.
    expect(gen.template).toBe("generator");
    expect(gen.footprint).toEqual({ type: "rectangle", width: 4.5, height: 2 });
    // Turn 0 and a rectangle's zero anchor offset, so upstream's placement
    // carries through untouched.
    expect(gen.position).toEqual({ x: 2, y: -1 });
    expect(gen.rotation_degrees).toBe(90);
  });

  it("resizes a corner part's L onto the upstream rectangle, arms intact", () => {
    // corner-short's L exists only in the legacy polygon - upstream ships that
    // part as a plain rectangle - so the shape has to survive. Its *size* comes
    // from upstream all the same: Z moves each axis's far side onto the 1.5x2.5
    // rectangle and leaves the 0.5in arms where they are, so the emitted
    // polygon is still an L, still 0.5in-walled (which is what lRuin draws), and
    // now exactly upstream's bounding box.
    const out = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    const child = out.pieces[1];
    expect(child.template).toBe("corner-short");
    expect(child.footprint).toEqual({
      type: "polygon",
      points: [
        { x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 1.5, y: 0.5 },
        { x: 0.5, y: 0.5 }, { x: 0.5, y: 2.5 }, { x: 0, y: 2.5 },
      ],
    });
  });

  it("throws when resizing cannot land on the upstream rectangle", () => {
    // Moving only the far side lands on the target box as long as the arm stays
    // inside it. Shrink the upstream rectangle past corner-short's 0.5in arm
    // (0.4in wide against an arm the near/far split leaves at 0.5) and the arm
    // itself becomes the widest thing in the polygon, so the result is 0.5 wide,
    // not 0.4. That has to throw rather than emit a piece that is not upstream's
    // size after all.
    const bad = new Map(templatesById);
    bad.set("bm-part-small-l-a5777aceb2", {
      id: "bm-part-small-l-a5777aceb2",
      footprint: { type: "rectangle", width: 0.4, height: 2.5 },
    });
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), bad),
    ).toThrow(/resizing its legacy polygon/);
  });

  it("throws when a mapped legacy template is missing from the table", () => {
    const without = new Map(templatesById);
    without.delete("corner-short");
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), without),
    ).toThrow(/corner-short/);
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

  it("keeps the half-turn a mirrored parent introduces", () => {
    // Handedness alone does not pin K: FLIP_Y = R(180) . FLIP_X, so a K that
    // collapses P . F to one reflection has the right parity and the wrong
    // orientation. Under a mirrored parent (M = FLIP_X, det -1):
    //
    //   small-l  flip:true   K = FLIP_Y . FLIP_X = R(180), turn 180
    //                        => A = R(90) . R(180) . R(180) = R(90)
    //   tower    flip:false  K = FLIP_Y, turn 0  => A = FLIP_Y
    //
    // Collapsing to `improper ? FLIP_X : IDENTITY` gives 270 and 0 instead -
    // a half-turn out in both cases, with identical mirror flags, which is
    // exactly what the assertions above cannot see.
    const out = normalizeLayout(
      layoutWith({ rotation_degrees: 0, mirror: "horizontal" }),
      templatesById,
    );
    expect(out.pieces[1].rotation_degrees).toBe(90);
    expect(out.pieces[2].rotation_degrees).toBe(180);
    // ...and the proper-parent case is untouched by the composition.
    const plain = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    expect(plain.pieces[1].rotation_degrees).toBe(270);
    expect(plain.pieces[2].rotation_degrees).toBe(0);
  });

  it("folds a registered rigid variant into the area's own transform", () => {
    const templates = new Map([
      [
        "bm-composite-bigrect-cd-ef-01-19f1adc57b",
        {
          id: "bm-composite-bigrect-cd-ef-01-19f1adc57b",
          name: "Battlemaster BigRect CD EF 01",
          footprint: { type: "polygon", points: [] },
          features: [],
        },
      ],
    ]);
    const out = normalizeLayout(
      {
        id: "fixture",
        pieces: [{ id: "area-01", piece_type: "area",
                   template: "bm-composite-bigrect-cd-ef-01-19f1adc57b",
                   position: { x: 0, y: 0 }, rotation_degrees: 30 }],
      },
      templates,
    );
    // V is a 180-degree rotation, so it lands entirely in rotation_degrees.
    expect(out.pieces[0].template).toBe("area-large");
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

  it("throws on an unhandled composite feature field", () => {
    // `mirror` used to be this test's subject; upstream started shipping one and
    // the module now handles it (see "applies a feature's own mirror" below). An
    // inline `footprint` takes its place as the field that would be dropped in
    // silence - it would lose to the template's under F/Z, so the part would
    // quietly draw at the wrong size.
    const withFootprint = new Map([
      ["bm-composite-shortline-30-aaaaaaaaaa", {
        id: "bm-composite-shortline-30-aaaaaaaaaa",
        name: "Battlemaster ShortLine 30",
        features: [{ id: "f", template: "bm-part-pipes-fc0edd53ea",
                     position: { x: 0, y: 0 },
                     footprint: { type: "rectangle", width: 1, height: 1 } }],
      }],
    ]);
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), withFootprint),
    ).toThrow(/unhandled field `footprint`/);
  });

  it("throws on an unmapped part", () => {
    const bad = new Map([
      ["bm-composite-shortline-30-aaaaaaaaaa", {
        id: "bm-composite-shortline-30-aaaaaaaaaa",
        name: "Battlemaster ShortLine 30",
        features: [{ id: "f", template: "bm-part-obelisk-0123456789",
                     position: { x: 0, y: 0 } }],
      }],
    ]);
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), bad),
    ).toThrow(/obelisk/);
  });
});

// The battlemaster-11e re-source split a part's old `footprint` rectangle in
// two: `footprint` became the roofed area and the rest of the model moved into
// `walls`. Both the *size* and the *anchor* have to be put back, and the anchor
// is the one nothing else in this file would catch - a wrong extent shows up as
// a wrong footprint, but a wrong anchor only shows up as a part drifting out of
// its own parent.
describe("partExtent / partAnchorShift", () => {
  // An L-ruin shaped part: the roof is one corner of the model, the walls run
  // out to the model's full extent.
  const walled = {
    id: "bm-part-tower-ddab4cb687",
    footprint: {
      type: "polygon",
      points: [
        { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 }, { x: 0, y: -2 },
      ],
    },
    walls: [{ points: [{ x: 0, y: 0 }, { x: 0, y: -3 }], thickness: 0.5 }],
  };

  it("reads the extent from the roof and the walls together", () => {
    // Roof alone is 2x2 and the wall centreline alone is 0x3; the model is
    // neither. Taking the union gives 2x3.
    expect(partExtent(walled)).toEqual({ type: "rectangle", width: 2, height: 3 });
  });

  it("measures the anchor shift from the roof centre to the extent centre", () => {
    // Roof centre (1, -1), extent centre (1, -1.5).
    expect(partAnchorShift(walled)).toEqual({ x: 0, y: -0.5 });
  });

  it("falls back to the footprint for a part with no walls", () => {
    const bare = { id: "x", footprint: { type: "rectangle", width: 4, height: 1 } };
    expect(partExtent(bare)).toEqual(bare.footprint);
    expect(partAnchorShift(bare)).toEqual({ x: 0, y: 0 });
  });

  it("anchors a child on its extent centre, not its roof centre", () => {
    const templates = new Map([
      ["gantry", { id: "gantry", footprint: { type: "rectangle", width: 2, height: 2 } }],
      ["bm-part-tower-ddab4cb687", walled],
      ["bm-composite-shortline-90-cccccccccc", {
        id: "bm-composite-shortline-90-cccccccccc",
        name: "Battlemaster ShortLine 90",
        footprint: { type: "polygon", points: [] },
        features: [{ id: "feature-1", template: "bm-part-tower-ddab4cb687",
                     position: { x: 3, y: 7 } }],
      }],
    ]);
    const out = normalizeLayout(
      { id: "fixture", pieces: [{ id: "area-01", piece_type: "area",
          template: "bm-composite-shortline-90-cccccccccc",
          position: { x: 0, y: 0 } }] },
      templates,
    );
    const child = out.pieces[1];
    // `tower` is an upstreamFootprint part, so it draws at the extent - 2x3, not
    // the roof's 2x2 and not the legacy gantry's own 2x2.
    expect(child.footprint).toEqual({ type: "rectangle", width: 2, height: 3 });
    // ...and sits half an inch below where `position` alone would put it,
    // because `position` names the roof's centre.
    expect(child.position).toEqual({ x: 3, y: 6.5 });
  });
});

describe("fields the re-source introduced", () => {
  const templates = new Map([
    ["gantry", { id: "gantry", footprint: { type: "rectangle", width: 2, height: 2 } }],
    ["bm-part-tower-ddab4cb687", {
      id: "bm-part-tower-ddab4cb687",
      footprint: { type: "rectangle", width: 2, height: 2.5 },
    }],
    ["bm-part-ruin-part-50523bac4f", {
      id: "bm-part-ruin-part-50523bac4f",
      footprint: { type: "rectangle", width: 1, height: 1 },
    }],
  ]);
  const composite = (id, name, features) =>
    new Map([...templates, [id, { id, name, footprint: { type: "polygon", points: [] }, features }]]);
  const run = (id, name, features, piece = {}) =>
    normalizeLayout(
      { id: "fixture", pieces: [{ id: "area-01", piece_type: "area", template: id,
                                  position: { x: 0, y: 0 }, ...piece }] },
      composite(id, name, features),
    );

  it("applies a feature's own mirror, and cancels it in K", () => {
    // Upstream ships one composite whose feature carries a `mirror`. It is the
    // same axis K controls, so P has to cancel the feature's parity as well as
    // the parent's: `tower` is flip:false, so its emitted hand must stay proper.
    const out = run(
      "bm-composite-shortline-91-dddddddddd", "Battlemaster ShortLine 91",
      [{ id: "feature-1", template: "bm-part-tower-ddab4cb687",
         position: { x: 0, y: 0 }, mirror: "horizontal" }],
    );
    const child = out.pieces[1];
    // A = FLIP_X . FLIP_Y = R(180): proper, so no mirror survives onto the child.
    expect("mirror" in child).toBe(false);
    expect(child.rotation_degrees).toBe(180);
  });

  it("emits no child for a part registered as dropped", () => {
    const out = run(
      "bm-composite-shortline-92-eeeeeeeeee", "Battlemaster ShortLine 92",
      [{ id: "feature-1", template: "bm-part-ruin-part-50523bac4f",
         position: { x: 1, y: 1 } }],
    );
    expect(out.pieces.map((p) => p.piece_type)).toEqual(["area"]);
  });

  it("anchors children through a variant that is not self-inverse", () => {
    // Triangle#12 registers R270, the first variant that is not its own inverse.
    // The child's anchor has to undo V with a real inverse: whatever V is, the
    // child must resolve to the same point upstream's feature does, which with
    // an unrotated parent is `feature.position` itself.
    const id = "bm-composite-triangle-ab-corner-flip-e300f1fbc2";
    const out = run(id, "Battlemaster Triangle AB Corner flip",
      [{ id: "feature-1", template: "bm-part-tower-ddab4cb687",
         position: { x: 4, y: 1 } }]);
    const [area, child] = out.pieces;
    expect(area.template).toBe("area-trapezoid");
    const placed = matvec(pieceMatrix(area), child.position);
    expect(placed.x).toBeCloseTo(4, 10);
    expect(placed.y).toBeCloseTo(1, 10);
    // Applying V instead of its inverse would land on R(180) . (4, 1).
    expect(child.position).not.toEqual({ x: 4, y: 1 });
  });
});
