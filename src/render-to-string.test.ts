// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { makeMissionCard, renderMissionCardToString } from "./main.js";
import { baseTheme } from "./presets/theme.js";
import { buildConfig } from "./presets/build-config.js";
import { missions } from "./presets/missions.js";
import type { FullConfig } from "./types.js";

/**
 * Serializes the DOM path's node as XML, giving the string path something to
 * be compared against byte for byte.
 *
 * Comparing markup rather than parsing ours back matters: happy-dom's
 * `DOMParser` is not a strict XML parser. It accepts a bare `&` in text and
 * silently re-emits it as `&amp;`, so a round-trip would launder markup that a
 * real browser rejects with a `parsererror`.
 */
function domMarkup(node: SVGElement): string {
  return new XMLSerializer().serializeToString(node);
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
  features: [
    { type: "generator", x: 4, y: 4, width: 5, height: 3, color: "teal" },
    { type: "l-ruin", x: 20, y: 10, width: 6, height: 4, rotation: 30, color: "green" },
  ],
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
    "objectives, annotations and top-level features",
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
    expect(renderMissionCardToString(config)).toBe(
      domMarkup(makeMissionCard(config)),
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

  it("sizes the root <svg> when width and height are given", () => {
    const markup = renderMissionCardToString(
      buildConfig({ mission: missions.dawn_of_war }),
      baseTheme,
      { width: 60 * 15, height: "100%" },
    );
    expect(markup).toContain('viewBox="0 0 60 44"');
    expect(markup).toContain('width="900"');
    expect(markup).toContain('height="100%"');
  });

  it("emits no width or height by default, leaving the viewBox to scale", () => {
    const markup = renderMissionCardToString(
      buildConfig({ mission: missions.dawn_of_war }),
    );
    expect(markup.slice(0, markup.indexOf(">"))).not.toMatch(
      /\s(width|height)=/,
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
