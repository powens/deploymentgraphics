import type { TerrainConfig } from "../terrain-config.js";
import type { BaseConfig, DeploymentConfig, FullConfig } from "../types.js";
import { baseConfig } from "./base.js";

/**
 * Empty rather than `gwTerrain`: a default argument is a use, so defaulting to
 * the corpus would pull all of it into any bundle that imports `buildConfig`.
 */
const emptyTerrain: TerrainConfig = { templates: {}, layout: {} };

/** Inputs for {@link buildConfig}. Only `mission` is required. */
export interface BuildConfigOptions {
  /** The mission deployment map to render. */
  mission: DeploymentConfig;
  /**
   * Terrain templates and layouts. Defaults to empty; pass `gwTerrain` to
   * draw buildings.
   */
  terrain?: TerrainConfig;
  /**
   * Which terrain layout to draw: a key in `terrain.layout`. Defaults to `""`
   * (no layout), which renders no buildings.
   */
  layout?: string;
  /** Board size and draw flags. Defaults to {@link baseConfig}. */
  base?: BaseConfig;
  /** Override the grid's `draw` flag without mutating `base`. */
  grid?: boolean;
  /** Override the territory line's `draw` flag without mutating `base`. */
  territory?: boolean;
}

/**
 * Assembles the {@link FullConfig} `makeMissionCard` consumes. Never mutates
 * its inputs, so preset objects are safe to reuse.
 */
export function buildConfig({
  mission,
  terrain = emptyTerrain,
  layout = "",
  base = baseConfig,
  grid,
  territory,
}: BuildConfigOptions): FullConfig {
  let resolvedBase = base;
  if (grid !== undefined) {
    resolvedBase = { ...resolvedBase, grid: { ...resolvedBase.grid, draw: grid } };
  }
  if (territory !== undefined) {
    resolvedBase = {
      ...resolvedBase,
      territory: { ...resolvedBase.territory, draw: territory },
    };
  }
  return {
    deployment: mission,
    base: resolvedBase,
    terrain: { ...terrain, layout_name: layout },
  };
}
