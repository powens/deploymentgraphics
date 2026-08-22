import { describe, it, expect } from "vitest";
import * as pkg from "./index.js";

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
