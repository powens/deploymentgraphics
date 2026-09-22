import { describe, it, expect } from "vitest";
import { normalizeLayout } from "./battlemaster-normalize.mjs";
import { FLIP_X, IDENTITY, matvec, rotationMatrix } from "../src/geometry.ts";

// `variantOf` fits each composite against its class's pinned reference, so a
// fixture table must carry that reference. The fit only needs a shape with no
// rigid self-symmetry, which an L is: a fixture composite drawn as the
// reference under the rigid map W registers at `W . refV`.
const REF_RING = [
  { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 },
  { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 },
];
const ringUnder = (M) => ({
  type: "polygon",
  points: REF_RING.map((p) => matvec(M, p)),
});
const REFERENCE = {
  // Pinned at R180, so a footprint drawn at R180 registers at the identity,
  // which every ShortLine fixture below wants.
  ShortLine: ["bm-composite-shortline-barrier-348db27c93", rotationMatrix(180)],
  // Pinned at R90.FX, so a footprint drawn at R0.FX registers at
  // FLIP_X . R90.FX = R270, the one variant that is not its own inverse.
  Triangle: ["bm-composite-triangle-ab-corner-02-4b8322162e", FLIP_X],
};
/** The class reference entry a fixture table needs, for `cls`. */
const referenceEntry = (cls) => {
  const [id] = REFERENCE[cls];
  return [id, { id, name: `Battlemaster ${cls} reference`, footprint: ringUnder(IDENTITY) }];
};
/** The footprint a fixture composite of `cls` carries to be registered. */
const fixtureFootprint = (cls) => ringUnder(REFERENCE[cls][1]);

// A minimal stand-in for the vendored data: one composite registered at the
// identity carrying two parts, one with a flip bit and one without, plus the
// legacy templates they map onto. Footprints are copied from
// terrain-templates.json.
//
// The upstream parts carry `footprint` and no `walls`, so partExtent falls back
// to the footprint and partAnchorShift to zero, isolating F, Z, K, Q and S. The
// `walls` path is tested at the end of this file.
const templatesById = new Map([
  [
    "corner-short",
    {
      id: "corner-short",
      // An L: 2x3 bbox with 0.5in arms. Z resizes it onto upstream's 1.5x2.5
      // (turn 180, so no axis swap) keeping the 0.5in arms; the resized L's
      // centroid-to-bbox offset is what the child's `position` must absorb.
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
  // A rectangle, so its anchor offset is 0. `tower` takes upstream's 2x2.5
  // footprint over this one, so both are here.
  ["gantry", { id: "gantry", footprint: { type: "rectangle", width: 2, height: 2 } }],
  [
    "bm-part-tower-ddab4cb687",
    {
      id: "bm-part-tower-ddab4cb687",
      footprint: { type: "rectangle", width: 2, height: 2.5 },
    },
  ],
  // The legacy generator is 3x4 and Battlemaster's part 4.5x2, so `generator`
  // carries upstream's footprint onto the child (F).
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
      footprint: fixtureFootprint("ShortLine"),
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
      footprint: fixtureFootprint("ShortLine"),
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
  referenceEntry("ShortLine"),
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
    // offset onto itself. The offset is read off the Z-resized 1.5x2.5 L: area
    // 1.75, centroid (13/28, 27/28), bbox centre (0.75, 1.25), so (-2/7, -2/7).
    expect(lRuin.position.x).toBeCloseTo(1.5 - 2 / 7, 10);
    expect(lRuin.position.y).toBeCloseTo(-0.25 - 2 / 7, 10);
    // A rectangle's centroid is its bbox centre, so position carries through.
    expect(tower.position).toEqual({ x: -1.5, y: 0.25 });
  });

  it("carries upstream's own footprint for the tower part", () => {
    const out = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    const tower = out.pieces[2];
    // Upstream's 2x2.5, not the legacy gantry's 2x2.
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
    // Upstream's 4.5x2, not the legacy 3x4. The template id stays so
    // rect-to-feature.mjs still types and colours it as a generator.
    expect(gen.template).toBe("generator");
    expect(gen.footprint).toEqual({ type: "rectangle", width: 4.5, height: 2 });
    // Turn 0 and a zero anchor offset, so upstream's placement carries through.
    expect(gen.position).toEqual({ x: 2, y: -1 });
    expect(gen.rotation_degrees).toBe(90);
  });

  it("resizes a corner part's L onto the upstream rectangle, arms intact", () => {
    // Upstream ships this part as a plain rectangle, so the L comes from the
    // legacy polygon and the size from upstream: Z moves each axis's far side
    // onto 1.5x2.5 and leaves the 0.5in arms (what lRuin draws) alone.
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
    // A 0.4in-wide target is narrower than the 0.5in arm the near/far split
    // leaves in place, so the result is 0.5 wide and must throw rather than
    // emit a piece that is not upstream's size.
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
    // small-l has flip:true under an unmirrored parent, so K is improper.
    const plain = normalizeLayout(layoutWith({ rotation_degrees: 0 }), templatesById);
    expect(plain.pieces[1].mirror).toBe("horizontal");
    expect("mirror" in plain.pieces[2]).toBe(false);
  });

  it("cancels the parent's parity so handedness survives a mirrored area", () => {
    // Parent mirrored: small-l's K becomes proper and tower's improper, so
    // each part keeps its absolute handedness.
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
    // Collapsing to `improper ? FLIP_X : IDENTITY` gives 270 and 0 instead: a
    // half-turn out in both, with the same mirror flags the test above checks.
    const out = normalizeLayout(
      layoutWith({ rotation_degrees: 0, mirror: "horizontal" }),
      templatesById,
    );
    expect(out.pieces[1].rotation_degrees).toBe(90);
    expect(out.pieces[2].rotation_degrees).toBe(180);
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
    // BigRect's reference is registered at R180, a pure rotation.
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
    // An inline feature `footprint` would lose to the template's under F/Z, so
    // the part would silently draw at the wrong size.
    const withFootprint = new Map([
      referenceEntry("ShortLine"),
      ["bm-composite-shortline-30-aaaaaaaaaa", {
        id: "bm-composite-shortline-30-aaaaaaaaaa",
        name: "Battlemaster ShortLine 30",
        footprint: fixtureFootprint("ShortLine"),
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
      referenceEntry("ShortLine"),
      ["bm-composite-shortline-30-aaaaaaaaaa", {
        id: "bm-composite-shortline-30-aaaaaaaaaa",
        name: "Battlemaster ShortLine 30",
        footprint: fixtureFootprint("ShortLine"),
        features: [{ id: "f", template: "bm-part-obelisk-0123456789",
                     position: { x: 0, y: 0 } }],
      }],
    ]);
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), bad),
    ).toThrow(/obelisk/);
  });

  it("throws by name for a composite with no footprint to fit", () => {
    const noFootprint = new Map([
      referenceEntry("ShortLine"),
      ["bm-composite-shortline-30-aaaaaaaaaa", {
        id: "bm-composite-shortline-30-aaaaaaaaaa",
        name: "Battlemaster ShortLine 30",
        features: [],
      }],
    ]);
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), noFootprint),
    ).toThrow(/bm-composite-shortline-30-aaaaaaaaaa has no footprint/);
  });

  // A footprint symmetric under one of the eight rigid maps fits under two of
  // them, so without the guard `CANDIDATES` insertion order would pick the
  // variant. This is why REF_RING is an L.
  it("throws for a footprint whose self-symmetry leaves the variant undetermined", () => {
    const square = { type: "polygon", points: [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ] };
    const [refId] = REFERENCE.ShortLine;
    const symmetric = new Map([
      [refId, { id: refId, name: "Battlemaster ShortLine reference", footprint: square }],
      ["bm-composite-shortline-30-aaaaaaaaaa", {
        id: "bm-composite-shortline-30-aaaaaaaaaa",
        name: "Battlemaster ShortLine 30",
        footprint: square,
        features: [],
      }],
    ]);
    expect(() =>
      normalizeLayout(layoutWith({ rotation_degrees: 0 }), symmetric),
    ).toThrow(/rigid self-symmetry/);
  });
});

// The earlier upstream schema: `footprint` is only the roof and the rest of
// the model is in `walls`. A wrong extent shows up as a wrong footprint, but a
// wrong anchor only as a part drifting out of its parent, which nothing else
// in this file catches.
describe("a part's extent and anchor", () => {
  // An L-ruin: the roof is one corner, the walls reach the full extent.
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
  const bare = {
    id: "bm-part-tower-ddab4cb687",
    footprint: { type: "rectangle", width: 4, height: 1 },
  };

  // `tower` is an upstreamFootprint part, so the child's footprint and
  // position read the extent and anchor directly.
  const towerChild = (part) => {
    const templates = new Map([
      ["gantry", { id: "gantry", footprint: { type: "rectangle", width: 2, height: 2 } }],
      ["bm-part-tower-ddab4cb687", part],
      referenceEntry("ShortLine"),
      ["bm-composite-shortline-90-cccccccccc", {
        id: "bm-composite-shortline-90-cccccccccc",
        name: "Battlemaster ShortLine 90",
        footprint: fixtureFootprint("ShortLine"),
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
    return out.pieces[1];
  };

  it("reads the extent from the roof and the walls together", () => {
    // Roof alone is 2x2 and the wall centreline 0x3; the union is 2x3.
    expect(towerChild(walled).footprint).toEqual({
      type: "rectangle", width: 2, height: 3,
    });
  });

  it("anchors the child on the extent centre, not the roof centre", () => {
    // Roof centre (1, -1), extent centre (1, -1.5).
    expect(towerChild(walled).position).toEqual({ x: 3, y: 6.5 });
  });

  it("falls back to the footprint for a part with no walls", () => {
    const child = towerChild(bare);
    expect(child.footprint).toEqual(bare.footprint);
    expect(child.position).toEqual({ x: 3, y: 7 });
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
  const composite = (id, name, features) => {
    const cls = name.split(" ")[1];
    return new Map([
      ...templates,
      referenceEntry(cls),
      [id, { id, name, footprint: fixtureFootprint(cls), features }],
    ]);
  };
  const run = (id, name, features, piece = {}) =>
    normalizeLayout(
      { id: "fixture", pieces: [{ id: "area-01", piece_type: "area", template: id,
                                  position: { x: 0, y: 0 }, ...piece }] },
      composite(id, name, features),
    );

  it("applies a feature's own mirror, and cancels it in K", () => {
    // P cancels the feature's parity as well as the parent's: `tower` is
    // flip:false, so its emitted hand must stay proper.
    const out = run(
      "bm-composite-shortline-91-dddddddddd", "Battlemaster ShortLine 91",
      [{ id: "feature-1", template: "bm-part-tower-ddab4cb687",
         position: { x: 0, y: 0 }, mirror: "horizontal" }],
    );
    const child = out.pieces[1];
    // A = FLIP_X . FLIP_Y = R(180).
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
    // The `-flip` Triangle registers R270, which is not self-inverse. With an
    // unrotated parent the child must resolve to `feature.position` itself.
    const id = "bm-composite-triangle-ab-corner-flip-e300f1fbc2";
    const out = run(id, "Battlemaster Triangle AB Corner flip",
      [{ id: "feature-1", template: "bm-part-tower-ddab4cb687",
         position: { x: 4, y: 1 } }]);
    const [area, child] = out.pieces;
    expect(area.template).toBe("area-trapezoid");
    expect("mirror" in area).toBe(false);
    const placed = matvec(rotationMatrix(area.rotation_degrees), child.position);
    expect(placed.x).toBeCloseTo(4, 10);
    expect(placed.y).toBeCloseTo(1, 10);
    // Applying V instead of its inverse would land on R(180) . (4, 1).
    expect(child.position).not.toEqual({ x: 4, y: 1 });
  });
});
