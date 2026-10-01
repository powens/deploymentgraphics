import { describe, expect, it } from "vitest";
import { renderMissionCardToString } from "./main.js";
import { buildConfig } from "./presets/build-config.js";
import { missions } from "./presets/missions.js";
import type { BuildingPlacement, Template } from "./building-coordinates.js";
import type { FeaturePlacement, IconPlacement } from "./terrain-config.js";
import type { FullConfig } from "./types.js";

/**
 * The renderer's registries are plain objects, so a lookup by an authored name
 * must not find `Object.prototype`'s members: `"constructor"` is not a feature
 * type, an icon, a palette colour or a template.
 */
const PROTOTYPE_KEYS = ["constructor", "toString", "__proto__", "hasOwnProperty"];

function withLayout(pieces: {
  templates?: BuildingPlacement[];
  icons?: IconPlacement[];
  features?: FeaturePlacement[];
}): FullConfig {
  const templates: Record<string, Template> = { "4x6": { width: 4, height: 6 } };
  return buildConfig({
    mission: missions.dawn_of_war,
    terrain: { templates, layout: { only: { templates: [], ...pieces } } },
    layout: "only",
  });
}

const feature = (over: Partial<FeaturePlacement>): FeaturePlacement => ({
  type: "generator",
  x: 4,
  y: 4,
  width: 5,
  height: 3,
  color: "teal",
  ...over,
});

describe("registry lookups ignore the object prototype", () => {
  it.each(PROTOTYPE_KEYS)("rejects feature type %j", (type) => {
    expect(() =>
      renderMissionCardToString(withLayout({ features: [feature({ type })] })),
    ).toThrow(`unknown feature type: ${type}`);
  });

  it.each(PROTOTYPE_KEYS)("rejects feature colour %j", (color) => {
    expect(() =>
      renderMissionCardToString(withLayout({ features: [feature({ color })] })),
    ).toThrow(`unknown feature colour: ${color}`);
  });

  it.each(PROTOTYPE_KEYS)("rejects icon type %j", (type) => {
    expect(() =>
      renderMissionCardToString(withLayout({ icons: [{ type, pos: { x: 5, y: 5 } }] })),
    ).toThrow(`unknown icon type: ${type}`);
  });

  it.each(PROTOTYPE_KEYS)("rejects template %j", (type) => {
    expect(() =>
      renderMissionCardToString(
        withLayout({ templates: [{ type, corners: { TL: { x: 10, y: 0 } } }] }),
      ),
    ).toThrow(`building references unknown template: ${type}`);
  });
});
