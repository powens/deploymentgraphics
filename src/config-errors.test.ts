import { describe, expect, it } from "vitest";
import { renderMissionCardToString } from "./main.js";
import { buildConfig } from "./presets/build-config.js";
import { missions } from "./presets/missions.js";
import { baseTheme } from "./presets/theme.js";
import type { TerrainConfig } from "./terrain-config.js";
import type { FullConfig } from "./types.js";

/**
 * A malformed config — hand-built, or YAML from the viewer's editor tab — must
 * fail naming the field at fault, not with a TypeError from deep in a layer.
 */
const valid = (): FullConfig => buildConfig({ mission: missions.search_and_destroy });

/** A terrain whose layout "1" carries one of each piece. */
const terrain = (): TerrainConfig => ({
  templates: {
    "4x6": { width: 4, height: 6 },
    poly: { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }] },
  },
  layout: {
    "1": {
      templates: [{ type: "4x6", corners: { TL: { x: 10, y: 5 } } }],
      icons: [{ type: "skull", pos: { x: 5, y: 5 }, player: "attacker" }],
      features: [{ type: "l-ruin", x: 1, y: 1, width: 3, height: 3, color: "rust" }],
    },
  },
});

const withTerrain = (): FullConfig =>
  buildConfig({ mission: missions.search_and_destroy, terrain: terrain(), layout: "1" });

/** Renders `config` as untyped input, the way YAML reaches the renderer. */
const render = (config: unknown): string =>
  renderMissionCardToString(config as FullConfig);

/** `base` with one field replaced; `path` is dot-separated. */
function withField(path: string, value: unknown, base: FullConfig = valid()): unknown {
  const config = structuredClone(base) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let node = config;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = value;
  return config;
}

/** `withTerrain()` with one field of layout "1" replaced. */
const inLayout = (path: string, value: unknown): unknown =>
  withField(`terrain.layout.1.${path}`, value, withTerrain());

const LAYOUT = 'config.terrain.layout["1"]';

describe("render-boundary validation", () => {
  it("renders the valid baselines", () => {
    expect(() => render(valid())).not.toThrow();
    expect(() => render(withTerrain())).not.toThrow();
  });

  it.each([
    ["an empty object", {}, "config.base: expected an object, got undefined"],
    ["a non-object", "nope", 'config: expected an object, got "nope"'],
    ["null", null, "config: expected an object, got null"],
  ])("names the missing field for %s", (_name, config, message) => {
    expect(() => render(config)).toThrow(message);
  });

  it.each([
    ["base.size", undefined, "config.base.size: expected { width, height } of positive numbers, got undefined"],
    ["base.size", { width: "60", height: 44 }, 'config.base.size: expected { width, height } of positive numbers, got {"width":"60","height":44}'],
    ["base.half_way_lines", undefined, "config.base.half_way_lines: expected an object (e.g. {} or { draw: false }), got undefined"],
    ["base.grid", undefined, "config.base.grid: expected an object (e.g. {} or { draw: false }), got undefined"],
    ["base.territory", undefined, "config.base.territory: expected an object (e.g. {} or { draw: false }), got undefined"],
    ["deployment", undefined, "config.deployment: expected an object, got undefined"],
    ["deployment.attacker", undefined, "config.deployment.attacker: expected an object, got undefined"],
    ["deployment.defender.deployment_zone", "x", 'config.deployment.defender.deployment_zone: expected an array, got "x"'],
    ["deployment.attacker.deployment_zone", [[60, 0]], "config.deployment.attacker.deployment_zone[0]: expected { x, y }, got [60,0]"],
    ["deployment.territory", "x", 'config.deployment.territory: expected an object, got "x"'],
    ["deployment.territory.end", undefined, "config.deployment.territory.end: expected { x, y }, got undefined"],
    ["terrain", undefined, "config.terrain: expected { templates, layout, layout_name }, got undefined"],
    ["terrain.layout", undefined, "config.terrain.layout: expected an object, got undefined"],
    ["terrain.templates", [], "config.terrain.templates: expected an object, got []"],
    ["terrain.layout_name", 1, "config.terrain.layout_name: expected a string, got 1"],
    ["objectives", {}, "config.objectives: expected an array, got {}"],
    ["annotations", "x", 'config.annotations: expected an array, got "x"'],
    ["features", 3, "config.features: expected an array, got 3"],
  ])("names %s when it is %j", (path, value, message) => {
    expect(() => render(withField(path, value))).toThrow(message);
  });

  it("names a bad objective", () => {
    expect(() => render(withField("objectives", [{ x: 1, y: 2, number: 1 }, { x: 1 }]))).toThrow(
      'config.objectives[1]: expected { x, y }, got {"x":1}',
    );
    expect(() => render(withField("objectives", [{ x: 1, y: 2, number: "1" }]))).toThrow(
      'config.objectives[0].number: expected a number, got "1"',
    );
  });

  it("names a bad annotation", () => {
    expect(() => render(withField("annotations", [{ kind: "label", x: 1, y: 2 }]))).toThrow(
      'config.annotations[0].kind: expected "text" or "arrow", got "label"',
    );
    expect(() => render(withField("annotations", [{ kind: "text", y: 2, text: "hi" }]))).toThrow(
      'config.annotations[0]: expected { x, y }, got {"kind":"text","y":2,"text":"hi"}',
    );
    expect(() =>
      render(withField("annotations", [{ kind: "arrow", x: 1, y: 2, endX: "5", endY: 3 }])),
    ).toThrow('config.annotations[0].endX: expected a number, got "5"');
  });

  it("still renders well-formed objectives and annotations", () => {
    const config = {
      ...valid(),
      objectives: [{ x: 30, y: 22, number: 1 }],
      annotations: [
        { kind: "text", x: 5, y: 5, text: "hi" },
        { kind: "arrow", x: 1, y: 2, endX: 5, endY: 3 },
        { kind: "arrow", x: 1, y: 2 },
      ],
    } satisfies FullConfig;
    expect(() => render(config)).not.toThrow();
  });

  // An emptied YAML value (`mirror:`) parses as null: it means the default.
  it.each([
    ["deployment.territory", valid()],
    ["objectives", valid()],
    ["terrain.layout.1.templates", withTerrain()],
    ["terrain.layout.1.templates.0.from", withTerrain()],
    ["terrain.layout.1.templates.0.mirror", withTerrain()],
    ["terrain.layout.1.icons.0.player", withTerrain()],
    ["terrain.layout.1.features.0.rotation", withTerrain()],
    ["terrain.layout.1.features.0.mirror", withTerrain()],
  ])("reads a null %s as absent", (path, base) => {
    expect(render(withField(path, null, base))).toBe(render(withField(path, undefined, base)));
  });
});

describe("layout selection", () => {
  it("names an id that is not a key of terrain.layout", () => {
    expect(() => render(withField("terrain.layout_name", "99", withTerrain()))).toThrow(
      'unknown layout "99": not a key of terrain.layout',
    );
  });

  it("does not select a layout from the object prototype", () => {
    expect(() => render(withField("terrain.layout_name", "constructor", withTerrain()))).toThrow(
      'unknown layout "constructor"',
    );
  });

  it("hints at passing the corpus when terrain.layout is empty", () => {
    expect(() => render(withField("terrain.layout_name", "bm-take-vs-take-02"))).toThrow(
      'unknown layout "bm-take-vs-take-02": terrain.layout is empty; ' +
        "pass the terrain that defines it (e.g. terrain: gwTerrain)",
    );
  });

  it.each([
    ["", null, `${LAYOUT}: expected an object, got null`],
    ["templates", {}, `${LAYOUT}.templates: expected an array, got {}`],
    ["icons", "x", `${LAYOUT}.icons: expected an array, got "x"`],
    ["features", 1, `${LAYOUT}.features: expected an array, got 1`],
  ])("names the selected layout's %s when it is %j", (path, value, message) => {
    const config = path === ""
      ? withField("terrain.layout.1", value, withTerrain())
      : inLayout(path, value);
    expect(() => render(config)).toThrow(message);
  });

  it("checks only the selected layout", () => {
    const config = withField("terrain.layout.other", { icons: "x" }, withTerrain());
    expect(() => render(config)).not.toThrow();
  });
});

describe("building templates", () => {
  const TEMPLATES = "config.terrain.templates";

  it.each([
    ["4x6", "x", `${TEMPLATES}["4x6"]: expected an object, got "x"`],
    ["4x6", { width: "4", height: 6 }, `${TEMPLATES}["4x6"].width: expected a positive number, got "4"`],
    ["4x6", { width: 4 }, `${TEMPLATES}["4x6"].height: expected a positive number, got undefined`],
    ["poly", { points: "x" }, `${TEMPLATES}["poly"].points: expected an array, got "x"`],
    ["poly", { points: [{ x: 0, y: 0 }, [3, 0], { x: 0, y: 3 }] }, `${TEMPLATES}["poly"].points[1]: expected { x, y }, got [3,0]`],
    ["poly", { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }, "template poly: polygon needs at least 3 points"],
  ])("names template %s when it is %j", (name, value, message) => {
    expect(() => render(withField(`terrain.templates.${name}`, value, withTerrain()))).toThrow(message);
  });
});

describe("building placements", () => {
  const AT = `${LAYOUT}.templates[0]`;
  const place = (placement: unknown): unknown => inLayout("templates", [placement]);

  it.each([
    ["a non-object", "4x6", `${AT}: expected an object, got "4x6"`],
    ["an unknown template", { type: "ghost", corners: { TL: { x: 0, y: 0 } } }, `${AT}.type: expected a key of config.terrain.templates, got "ghost"`],
    ["no corners", { type: "4x6", corners: {} }, `${AT}.corners: expected 1 or 2 corners, got {}`],
    [
      "three corners",
      { type: "4x6", corners: { TL: { x: 10, y: 5 }, TR: { x: 14, y: 5 }, BR: { x: 14, y: 11 } } },
      `${AT}.corners: expected 1 or 2 corners, got {"TL":{"x":10,"y":5},"TR":{"x":14,"y":5},"BR":{"x":14,"y":11}}`,
    ],
    ["an unknown corner name", { type: "4x6", corners: { TL: { x: 10, y: 5 }, MID: { x: 12, y: 5 } } }, `${AT}.corners: expected keys among TL, TR, BL, BR, got ["TL","MID"]`],
    ["an unknown corner `from`", { type: "4x6", corners: { TL: { x: 10, y: 5, from: "XX" } } }, `${AT}.corners.TL.from: expected one of TL, TR, BL, BR, got "XX"`],
    ["an unknown placement `from`", { type: "4x6", from: "top", corners: { TL: { x: 10, y: 5 } } }, `${AT}.from: expected one of TL, TR, BL, BR, got "top"`],
    ["a non-numeric corner", { type: "4x6", corners: { TL: { x: "10", y: 5 } } }, `${AT}.corners.TL: expected { x, y }, got {"x":"10","y":5}`],
    ["a non-boolean mirror", { type: "4x6", mirror: "no", corners: { TL: { x: 10, y: 5 } } }, `${AT}.mirror: expected a boolean, got "no"`],
  ])("names %s", (_name, placement, message) => {
    expect(() => render(place(placement))).toThrow(message);
  });
});

describe("icons", () => {
  const AT = `${LAYOUT}.icons[0]`;

  it.each([
    ["", null, `${AT}: expected an object, got null`],
    ["type", "dragon", `${AT}.type: expected one of skull, fortress, got "dragon"`],
    ["pos", [5, 5], `${AT}.pos: expected { x, y }, got [5,5]`],
    // Would otherwise reach `theme.deployment[player]` as undefined.
    ["player", "foo", `${AT}.player: expected "attacker" or "defender", got "foo"`],
  ])("names icon %s when it is %j", (path, value, message) => {
    const config = path === "" ? inLayout("icons.0", value) : inLayout(`icons.0.${path}`, value);
    expect(() => render(config)).toThrow(message);
  });
});

describe("features", () => {
  const palette = Object.keys(baseTheme.feature.palette).join(", ");

  it.each([
    ["type", "nope", '.type: expected one of l-ruin, l-ruin-mirror, generator, gantry, got "nope"'],
    ["color", "chartreuse", `.color: expected one of ${palette}, got "chartreuse"`],
    ["x", "1", '.x: expected a number, got "1"'],
    ["y", undefined, ".y: expected a number, got undefined"],
    ["width", 0, ".width: expected a positive number, got 0"],
    ["height", "3", '.height: expected a positive number, got "3"'],
    // A quoted YAML `rotation: "30"` would string-concatenate in `mirror`.
    ["rotation", "30", '.rotation: expected a number, got "30"'],
    ["mirror", "no", '.mirror: expected a boolean, got "no"'],
  ])("names feature %s when it is %j", (path, value, message) => {
    expect(() => render(inLayout(`features.0.${path}`, value))).toThrow(
      `${LAYOUT}.features[0]${message}`,
    );
    const feature = { type: "l-ruin", x: 1, y: 1, width: 3, height: 3, color: "rust", [path]: value };
    expect(() => render(withField("features", [feature]))).toThrow(
      `config.features[0]${message}`,
    );
  });

  it("checks colours against the theme it renders with", () => {
    const theme = {
      ...baseTheme,
      feature: { ...baseTheme.feature, palette: { chartreuse: { fill: "#7fff00", accent: "#000" } } },
    };
    const config = withField("features", [
      { type: "gantry", x: 1, y: 1, width: 3, height: 3, color: "chartreuse" },
    ]) as FullConfig;
    expect(() => renderMissionCardToString(config, theme)).not.toThrow();
  });
});

/**
 * The registries are plain objects, so a lookup by an authored name must not
 * find `Object.prototype`'s members: `"constructor"` is not a feature type, a
 * palette colour, an icon or a template.
 */
describe("registry lookups ignore the object prototype", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])("rejects %j", (key) => {
    const palette = Object.keys(baseTheme.feature.palette).join(", ");
    for (const [path, message] of [
      ["features.0.type", `${LAYOUT}.features[0].type: expected one of l-ruin, l-ruin-mirror, generator, gantry, got`],
      ["features.0.color", `${LAYOUT}.features[0].color: expected one of ${palette}, got`],
      ["icons.0.type", `${LAYOUT}.icons[0].type: expected one of skull, fortress, got`],
      ["templates.0.type", `${LAYOUT}.templates[0].type: expected a key of config.terrain.templates, got`],
    ]) {
      expect(() => render(inLayout(path, key))).toThrow(`${message} ${JSON.stringify(key)}`);
    }
  });
});

describe("buildConfig", () => {
  it("checks the config it assembles, pieces included", () => {
    const bad = terrain();
    bad.layout["1"].icons = [{ type: "skull", pos: { x: 5, y: 5 }, player: "foo" as "attacker" }];
    expect(() =>
      buildConfig({ mission: missions.search_and_destroy, terrain: bad, layout: "1" }),
    ).toThrow(`${LAYOUT}.icons[0].player: expected "attacker" or "defender", got "foo"`);
  });

  it("leaves feature colours to the render, which knows the theme", () => {
    const custom = terrain();
    custom.layout["1"].features![0].color = "chartreuse";
    expect(() =>
      buildConfig({ mission: missions.search_and_destroy, terrain: custom, layout: "1" }),
    ).not.toThrow();
  });
});
