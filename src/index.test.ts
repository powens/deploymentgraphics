import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as pkg from "./index.js";
import * as presets from "./presets/index.js";

/**
 * The published value exports, pinned so widening the API is a deliberate
 * edit here. Types can't be enumerated at runtime; `pnpm type-check` covers them.
 */
const RENDERERS = ["makeMissionCard", "renderMissionCardToString"] as const;

/** Everything `deploymentgraphics/presets` publishes. */
const PRESETS = [
  "baseConfig",
  "baseTheme",
  "buildConfig",
  "gwTerrain",
  "gwTerrainIndex",
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
 * Listed rather than read from `package.json`, so a new entry point fails
 * here until its surface is pinned too.
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
