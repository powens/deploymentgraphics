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

/** Renders through the string backend, which needs no DOM. */
const render = (layout: string) =>
  renderMissionCardToString(
    buildConfig({ mission: missions.dawn_of_war, layout }),
  );

/**
 * How many `<use>` elements a `<prefix>-<n>` counter emitted. Counting rather
 * than probing for `-0` is what makes this a tripwire: a converter that drops
 * all but the first placement of a kind still emits `building-0`.
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
