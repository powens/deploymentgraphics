// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { makeMissionCard, renderMissionCardToString } from "./main.js";
import { buildConfig } from "./presets/build-config.js";
import { missions } from "./presets/missions.js";
import type { FullConfig } from "./types.js";

/**
 * Parses rendered markup back into a DOM node and re-serializes it, so the
 * string path and the DOM path can be compared without tripping over
 * serialization differences (self-closing tags, the root `xmlns`).
 */
function reserialize(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  root.removeAttribute("xmlns");
  return root.outerHTML;
}

const withExtras = (config: FullConfig): FullConfig => ({
  ...config,
  objectives: [
    { x: 30, y: 22, number: 1 },
    { x: 10, y: 8, number: 2 },
  ],
  annotations: [
    { kind: "text", x: 5, y: 5, text: "Attacker & <defender>" },
    { kind: "arrow", x: 5, y: 6, endX: 20, endY: 12 },
  ],
  terrain: {
    ...config.terrain,
    area_terrain: [
      { shape: "circle", x: 4, y: 4, width: 8, label: "crater" },
      {
        shape: "polygon",
        x: 20,
        y: 10,
        width: 6,
        height: 4,
        rotation: 30,
        points: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 4 },
        ],
      },
    ],
  },
});

const cases: [string, FullConfig][] = [
  ["a bare mission with no layout", buildConfig({ mission: missions.dawn_of_war })],
  [
    "a masked-centre mission with grid and a terrain layout",
    buildConfig({
      mission: missions.search_and_destroy,
      layout: "take-and-hold-mirror-3",
      grid: true,
    }),
  ],
  [
    "objectives, annotations and area terrain",
    withExtras(
      buildConfig({
        mission: missions.tipping_point,
        layout: "1",
        territory: false,
      }),
    ),
  ],
];

describe("renderMissionCardToString", () => {
  it.each(cases)("matches the DOM renderer for %s", (_name, config) => {
    expect(reserialize(renderMissionCardToString(config))).toBe(
      makeMissionCard(config).outerHTML,
    );
  });

  it("declares the SVG namespace so the markup stands alone as a .svg file", () => {
    const markup = renderMissionCardToString(
      buildConfig({ mission: missions.dawn_of_war }),
    );
    expect(markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true,
    );
  });

  it("renders without a DOM present", () => {
    const globals = globalThis as { document?: unknown };
    const saved = globals.document;
    delete globals.document;
    try {
      expect(() =>
        renderMissionCardToString(buildConfig({ mission: missions.dawn_of_war })),
      ).not.toThrow();
    } finally {
      globals.document = saved;
    }
  });
});
