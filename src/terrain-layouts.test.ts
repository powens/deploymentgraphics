import { describe, it, expect } from "vitest";
import { renderMissionCardToString } from "./main.js";
import { buildConfig } from "./presets/build-config.js";
import { gwTerrain } from "./presets/terrain.js";
import { missions } from "./presets/missions.js";

/**
 * Renders every generated layout. The converters emit strings that must match
 * renderer registries (feature `type`, palette `color`, icon and building
 * `type`); an unregistered one only throws at render time, so a bad terrain
 * pull should fail here rather than at a consumer.
 */

const layoutNames = Object.keys(gwTerrain.layout);

/** Memoised: both per-layout tests render the same layouts. */
const markupCache = new Map<string, string>();
const render = (layout: string): string => {
  let markup = markupCache.get(layout);
  if (markup === undefined) {
    markup = renderMissionCardToString(
      buildConfig({ mission: missions.dawn_of_war, terrain: gwTerrain, layout }),
    );
    markupCache.set(layout, markup);
  }
  return markup;
};

/**
 * How many `<prefix>-<n>` ids were emitted. Counting (not probing for `-0`)
 * catches a renderer that skips some placements, e.g. a broken mirror
 * expansion. The `\d+` suffix excludes def ids like `icon-<type>`.
 */
const drawn = (markup: string, prefix: string) =>
  markup.match(new RegExp(`id="${prefix}-\\d+"`, "g"))?.length ?? 0;

/** Placements draw twice unless `mirror: false`; icons never mirror. */
const expanded = (placements: { mirror?: boolean }[] | undefined) =>
  (placements ?? []).reduce((n, p) => n + (p.mirror === false ? 1 : 2), 0);

describe("every bundled terrain layout", () => {
  it("ships the whole bundled corpus", () => {
    // Exact, so a converter dropping layouts can't silently shrink coverage.
    // Update when the 40kdc corpus changes.
    expect(layoutNames.length).toBe(45);
  });

  it.each(layoutNames)("%s renders", (name) => {
    expect(() => render(name)).not.toThrow();
  });

  it.each(layoutNames)("%s draws every piece it declares", (name) => {
    const layout = gwTerrain.layout[name];
    const markup = render(name);

    // Counting ids alone would pass a card whose every `href` dangles.
    const ids = new Set(
      [...markup.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),
    );
    const dangling = [
      ...new Set([...markup.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])),
    ].filter((href) => !ids.has(href));
    expect(dangling).toEqual([]);

    expect({
      buildings: drawn(markup, "building"),
      icons: drawn(markup, "icon"),
      features: drawn(markup, "feature"),
    }).toEqual({
      buildings: expanded(layout.templates),
      icons: layout.icons?.length ?? 0,
      features: expanded(layout.features),
    });
  });
});
