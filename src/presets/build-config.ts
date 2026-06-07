import type { TerrainConfig } from "../terrain-config.js";
import type { BaseConfig, DeploymentConfig, FullConfig } from "../types.js";
import { baseConfig } from "./base.js";
import { gwTerrain } from "./terrain.js";

/** Inputs for {@link buildConfig}. Only `mission` is required. */
export interface BuildConfigOptions {
  /** The mission deployment map to render. */
  mission: DeploymentConfig;
  /** Terrain templates and layouts. Defaults to {@link gwTerrain}. */
  terrain?: TerrainConfig;
  /**
   * Which terrain layout to draw. Defaults to `""` (no layout), which
   * renders no buildings.
   */
  layout?: string;
  /** Board size and draw flags. Defaults to {@link baseConfig}. */
  base?: BaseConfig;
  /** Override the grid's `draw` flag without mutating `base`. */
  grid?: boolean;
}

/**
 * Assembles a {@link FullConfig} — the object `makeMissionCard` consumes —
 * from a mission plus optional terrain, base styling, and UI overrides.
 *
 * All overrides are applied by spreading, never by mutation, so the
 * shared preset objects are safe to reuse across many calls.
 */
export function buildConfig({
  mission,
  terrain = gwTerrain,
  layout = "",
  base = baseConfig,
  grid,
}: BuildConfigOptions): FullConfig {
  return {
    deployment: mission,
    base:
      grid === undefined
        ? base
        : { ...base, grid: { ...base.grid, draw: grid } },
    terrain: { ...terrain, layout_name: layout },
  };
}
