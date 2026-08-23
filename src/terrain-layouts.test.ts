import { describe, it, expect } from "vitest";
import { renderMissionCardToString } from "./main.js";
import { buildConfig } from "./presets/build-config.js";
import { gwTerrain } from "./presets/terrain.js";
import { missions } from "./presets/missions.js";

/**
 * The pipeline seam test.
 *
 * `gwTerrain` is generated — `make update-terrain` reruns the converters and
 * rewrites `src/presets/terrain.ts` wholesale. Everything downstream of that
 * generation is checked structurally: `presets.test.ts` deep-equals the modules
 * against their YAML source, and the `--check` modes only verify each generator
 * agrees with its own last output. None of that crosses into the renderer.
 *
 * But the generated data carries *strings that must match the renderer's
 * registries* — a feature `type` keying `features`, a `color` keying
 * `theme.feature.palette`, an icon `type`, a building `type` keying
 * `templates`. A converter emitting an unregistered one is only discovered when
 * something renders it (`features.ts` throws at that point), which today means
 * at a consumer's render call, not at generation time.
 *
 * Rendering every bundled layout once puts that whole cross-seam agreement
 * under test, so a bad pull fails here instead of downstream.
 */

const layoutNames = Object.keys(gwTerrain.layout);

/**
 * Renders through the string backend, which needs no DOM. Memoised: both
 * assertions below run over the same 46 layouts, and rendering each one twice
 * buys nothing.
 */
const markupCache = new Map<string, string>();
const render = (layout: string): string => {
  let markup = markupCache.get(layout);
  if (markup === undefined) {
    markup = renderMissionCardToString(
      buildConfig({ mission: missions.dawn_of_war, layout }),
    );
    markupCache.set(layout, markup);
  }
  return markup;
};

/**
 * How many `<use>` elements a `<prefix>-<n>` counter emitted.
 *
 * What counting buys is a check on the *renderer*: a pass that silently skips
 * placements (a wrong `length > 0` guard, a mirror expansion that stopped
 * expanding) still emits `building-0`, so probing for the first id would miss
 * it. It is not a guard against the converters dropping placements — the
 * expected counts below are derived from the same generated `gwTerrain`, so a
 * shrunken layout shrinks both sides. Dropped *layouts* are caught by the
 * corpus-size pin; dropped pieces within a layout are not caught here.
 *
 * The `\d+` suffix is what separates placements from defs — `injectFeatureDefs`
 * and `injectIconDefs` emit `feature-<type>-<w>x<h>` and `icon-<type>` ids into
 * the same document.
 */
const drawn = (markup: string, prefix: string) =>
  markup.match(new RegExp(`id="${prefix}-\\d+"`, "g"))?.length ?? 0;

/**
 * Placements draw twice unless `mirror: false` — the same default `withMirror`
 * applies in `placement.ts`. Icons never mirror, so they are counted directly.
 */
const expanded = (placements: { mirror?: boolean }[] | undefined) =>
  (placements ?? []).reduce((n, p) => n + (p.mirror === false ? 1 : 2), 0);

describe("every bundled terrain layout", () => {
  it("ships the whole bundled corpus", () => {
    // Pinned exactly, not as a lower bound: the suite below only covers what
    // this list holds, so a converter that silently drops layouts would
    // otherwise shrink the coverage without failing anything. Update the
    // number deliberately when the 40kdc corpus gains or loses a layout.
    expect(layoutNames.length).toBe(46);
  });

  it.each(layoutNames)("%s renders", (name) => {
    expect(() => render(name)).not.toThrow();
  });

  it.each(layoutNames)("%s draws every piece it declares", (name) => {
    const layout = gwTerrain.layout[name];
    const markup = render(name);

    // A `<use>` counts as drawn only if its def is actually in the document:
    // counting ids alone would pass a card whose every reference dangled and
    // which therefore renders blank. (`area_terrain` shapes carry no ids and
    // are not covered by either check; the bundled corpus declares none.)
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
