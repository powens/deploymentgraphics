import { describe, it, expect } from "vitest";
import * as pkg from "./index.js";
import * as presets from "./presets/index.js";

/**
 * The package's published interface, pinned.
 *
 * `index.ts` used to be thirteen `export *` lines, which made every geometry,
 * placement and SVG-backend primitive a semver commitment by accident. Naming
 * the exports fixed that once; this list keeps it fixed, so widening the
 * interface stays a deliberate edit to a visible list rather than a side
 * effect of adding an `export` somewhere in the implementation.
 *
 * Types can't be enumerated at runtime, so this covers the value exports —
 * the ones that carry code, and the ones re-exporting a whole module would
 * leak. `pnpm type-check` covers the type side.
 *
 * `package.json` publishes a second entry, `./presets`, so pinning the root
 * alone would leave half the committed surface unguarded — that is how
 * `eventMatrix` stayed reachable as `deploymentgraphics/presets` after the
 * root stopped exporting it.
 */
const PUBLIC_VALUES = [
  // Renderers
  "makeMissionCard",
  "renderMissionCardToString",
  // Presets
  "baseConfig",
  "baseTheme",
  "buildConfig",
  "gwTerrain",
  "gwTemplatesReal",
  "missions",
  "dawnOfWar",
  "crucibleOfBattle",
  "hammerAndAnvil",
  "searchAndDestroy",
  "sweepingEngagement",
  "tippingPoint",
] as const;

describe("the package root", () => {
  it("exports exactly the documented values", () => {
    expect(Object.keys(pkg).sort()).toEqual([...PUBLIC_VALUES].sort());
  });

  it("keeps the implementation primitives internal", () => {
    // A sample of what the old barrel published: geometry, the placement
    // seam, and the SVG backend. Each still has internal callers, which
    // import it by path.
    for (const name of [
      "rotate",
      "localCorner",
      "resolveCorner",
      "templateBounds",
      "toPoint",
      "placedTransform",
      "mirror",
      "resolveLayout",
      "mergeTerrain",
      "serializeSvg",
      "applyAttributes",
      "VirtualSvgElement",
      "browserSvgDocument",
      "virtualSvgDocument",
      "injectTemplateDefs",
      "makeBuildings",
      "segmentsToPathData",
      "eventMatrixKey",
      "resolveMission",
      "resolveTerrainLayout",
    ]) {
      expect(pkg).not.toHaveProperty(name);
    }
  });
});

describe("the presets entry", () => {
  it("exports the same presets as the root, and nothing the root omits", () => {
    const rootPresets = PUBLIC_VALUES.filter(
      (name) => name !== "makeMissionCard" && name !== "renderMissionCardToString",
    );
    expect(Object.keys(presets).sort()).toEqual([...rootPresets].sort());
  });

  it("keeps the event matrix out of the package module graph", () => {
    // No renderer reads it. The browser demo does, and reaches it by path
    // through `bundle.ts` rather than through a published entry.
    expect(presets).not.toHaveProperty("eventMatrix");
  });
});
