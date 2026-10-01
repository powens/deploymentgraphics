import { describe, expect, it } from "vitest";
import { renderMissionCardToString } from "./main.js";
import { buildConfig } from "./presets/build-config.js";
import { missions } from "./presets/missions.js";
import type { FullConfig } from "./types.js";

/**
 * A malformed config — hand-built, or YAML from the viewer's editor tab — must
 * fail naming the field at fault, not with a TypeError from deep in a layer.
 */
const valid = (): FullConfig => buildConfig({ mission: missions.search_and_destroy });

/** Renders `config` as untyped input, the way YAML reaches the renderer. */
const render = (config: unknown): string =>
  renderMissionCardToString(config as FullConfig);

/** `valid()` with one field replaced; `path` is dot-separated. */
function withField(path: string, value: unknown): unknown {
  const config = structuredClone(valid()) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let node = config;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = value;
  return config;
}

describe("render-boundary validation", () => {
  it("renders the valid baseline", () => {
    expect(() => render(valid())).not.toThrow();
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
      'objectives[1]: expected { x, y }, got {"x":1}',
    );
    expect(() => render(withField("objectives", [{ x: 1, y: 2, number: "1" }]))).toThrow(
      'objectives[0].number: expected a number, got "1"',
    );
  });

  it("names a bad annotation", () => {
    expect(() => render(withField("annotations", [{ kind: "label", x: 1, y: 2 }]))).toThrow(
      'annotations[0].kind: expected "text" or "arrow", got "label"',
    );
    expect(() => render(withField("annotations", [{ kind: "text", y: 2, text: "hi" }]))).toThrow(
      'annotations[0]: expected { x, y }, got {"kind":"text","y":2,"text":"hi"}',
    );
    expect(() =>
      render(withField("annotations", [{ kind: "arrow", x: 1, y: 2, endX: "5", endY: 3 }])),
    ).toThrow('annotations[0].endX: expected a number, got "5"');
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
});
