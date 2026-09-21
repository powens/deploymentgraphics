import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
 * alone would leave half the committed surface unguarded — which is why the
 * lists below are split by entry point and composed, rather than one flat
 * list the presets assertion re-derives.
 */
const RENDERERS = ["makeMissionCard", "renderMissionCardToString"] as const;

/** Everything `deploymentgraphics/presets` publishes — bundled data, no logic. */
const PRESETS = [
  "baseConfig",
  "baseTheme",
  "buildConfig",
  "gwTerrain",
  "gwTemplatesReal",
  "eventMatrix",
  "missions",
  "dawnOfWar",
  "crucibleOfBattle",
  "hammerAndAnvil",
  "searchAndDestroy",
  "sweepingEngagement",
  "tippingPoint",
] as const;

/** Two dispositions -> the mission they play, and the layout that covers it. */
const RESOLUTION = [
  "resolveMission",
  "resolveTerrainLayout",
  "eventMatrixKey",
  "dispositions",
] as const;

const PUBLIC_VALUES = [...RENDERERS, ...PRESETS, ...RESOLUTION] as const;

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
      "serializeSvg",
      "applyAttributes",
      "VirtualSvgElement",
      "browserSvgDocument",
      "virtualSvgDocument",
      "injectTemplateDefs",
      "makeBuildings",
    ]) {
      expect(pkg).not.toHaveProperty(name);
    }
  });
});

/**
 * The subpaths `package.json` publishes, and which this file therefore has to
 * pin. Listed rather than derived, so the assertion below is a tripwire: a
 * third entry point added to `exports` fails here until someone comes back and
 * guards its surface too.
 */
const GUARDED_SUBPATHS = [".", "./presets"];

describe("the published entry points", () => {
  it("are all pinned by this file", () => {
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports).sort()).toEqual(
      [...GUARDED_SUBPATHS].sort(),
    );
  });
});

describe("the presets entry", () => {
  it("exports exactly the presets, and nothing the root omits", () => {
    expect(Object.keys(presets).sort()).toEqual([...PRESETS].sort());
  });

  it("is a subset of the root, so either import reaches the same preset", () => {
    for (const name of PRESETS) expect(pkg).toHaveProperty(name);
    expect(presets.eventMatrix).toBe(pkg.eventMatrix);
  });
});
