// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeMissionCard, renderMissionCardToString } from "./main.js";
import { baseTheme } from "./presets/theme.js";
import { buildConfig } from "./presets/build-config.js";
import { missions } from "./presets/missions.js";
import { gwTerrain } from "./presets/terrain.js";
import type { FullConfig } from "./types.js";

/**
 * Two cards inline on one page share an id namespace, so a card's
 * `href="#…"`/`url(#…)` would resolve to whichever card's def came first.
 * `idPrefix` keeps each card's ids, and every reference to them, its own.
 */

// Every kind of def a card can emit: templates, features, icons, the
// masked centre (search_and_destroy), the arrowhead marker.
const config: FullConfig = {
  ...buildConfig({
    mission: missions.search_and_destroy,
    terrain: gwTerrain,
    layout: "bm-take-vs-take-03",
    grid: true,
  }),
  objectives: [{ x: 30, y: 22, number: 1 }],
  annotations: [{ kind: "arrow", x: 5, y: 6, endX: 20, endY: 12 }],
  features: [{ type: "generator", x: 4, y: 4, width: 5, height: 3, color: "teal" }],
};

const ids = (svg: string): string[] =>
  [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);

const references = (svg: string): string[] => [
  ...[...svg.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]),
  ...[...svg.matchAll(/url\(#([^)]*)\)/g)].map((m) => m[1]),
];

describe("idPrefix", () => {
  const a = renderMissionCardToString(config, baseTheme, { idPrefix: "a-" });
  const b = renderMissionCardToString(config, baseTheme, { idPrefix: "b-" });

  it("exercises every reference kind", () => {
    const refs = references(a);
    for (const kind of ["template-", "feature-", "icon-", "center-hole-", "arrowhead"]) {
      expect(refs.some((r) => r.startsWith(`a-${kind}`)), kind).toBe(true);
    }
  });

  it("prefixes every id", () => {
    expect(ids(a).length).toBeGreaterThan(0);
    expect(ids(a).every((id) => id.startsWith("a-"))).toBe(true);
    expect(ids(b).every((id) => id.startsWith("b-"))).toBe(true);
  });

  it("gives the two cards disjoint ids", () => {
    const shared = ids(a).filter((id) => new Set(ids(b)).has(id));
    expect(shared).toEqual([]);
  });

  it.each([
    ["a", a],
    ["b", b],
  ])("resolves every reference in card %s within that card", (_name, svg) => {
    const own = new Set(ids(svg));
    const refs = references(svg);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((ref) => !own.has(ref))).toEqual([]);
  });

  it("leaves the markup byte-identical when empty or absent", () => {
    const plain = renderMissionCardToString(config);
    expect(renderMissionCardToString(config, baseTheme, { idPrefix: "" })).toBe(plain);
    expect(plain).toContain('href="#template-');
  });

  it("only rewrites ids and references", () => {
    const plain = renderMissionCardToString(config);
    const unprefixed = a
      .replaceAll(' id="a-', ' id="')
      .replaceAll('href="#a-', 'href="#')
      .replaceAll("url(#a-", "url(#");
    expect(unprefixed).toBe(plain);
  });

  // A theme can only reference defs outside the card (it cannot add any), so
  // those references must survive untouched.
  it("leaves references to defs outside the card alone", () => {
    const theme = { ...baseTheme, background: { fill: "url(#page-gradient)" } };
    const svg = renderMissionCardToString(config, theme, { idPrefix: "a-" });
    expect(svg).toContain('fill="url(#page-gradient)"');
    expect(svg).toContain('mask="url(#a-center-hole-attacker)"');
  });

  it("applies to makeMissionCard's DOM too", () => {
    const svg = makeMissionCard(config, baseTheme, { idPrefix: "dom-" });
    expect(svg.querySelector("#dom-buildings use")?.getAttribute("href")).toMatch(
      /^#dom-template-/,
    );
    expect(svg.querySelector("#buildings")).toBeNull();
  });

  it.each(["has space", "1st-", "#a", "a)"])("rejects %j, which cannot be an id reference", (idPrefix) => {
    expect(() => renderMissionCardToString(config, baseTheme, { idPrefix })).toThrow(
      `idPrefix: expected a letter or _ followed by letters, digits, _, - or ., got ${JSON.stringify(idPrefix)}`,
    );
  });
});
