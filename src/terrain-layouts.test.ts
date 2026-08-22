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

describe("every bundled terrain layout", () => {
  it("ships more than the handful the renderer tests name", () => {
    // Guards the suite below against silently covering nothing if the preset
    // ever regenerates empty.
    expect(layoutNames.length).toBeGreaterThan(40);
  });

  it.each(layoutNames)("%s renders", (name) => {
    expect(() => render(name)).not.toThrow();
  });

  it.each(layoutNames)("%s draws every piece it declares", (name) => {
    const layout = gwTerrain.layout[name];
    const markup = render(name);

    // Each placement emits at least one `<use>` (two when mirrored), so a
    // declared piece that draws nothing shows up as a missing id.
    const drawn = (prefix: string) =>
      markup.includes(`id="${prefix}-0"`);

    expect({
      buildings: drawn("building"),
      icons: drawn("icon"),
      features: drawn("feature"),
    }).toEqual({
      buildings: (layout.templates?.length ?? 0) > 0,
      icons: (layout.icons?.length ?? 0) > 0,
      features: (layout.features?.length ?? 0) > 0,
    });
  });
});
