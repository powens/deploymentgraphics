import { deploymentIdForPattern } from "../missions.js";
import type { TerrainConfig } from "../terrain-config.js";
import type { BaseConfig, DeploymentConfig, FullConfig } from "../types.js";
import { baseConfig } from "./base.js";
import { deployments } from "./deployments.js";
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

/** Inputs for {@link buildMissionConfig}. Only `layoutId` is required. */
export interface BuildMissionConfigOptions {
  /**
   * The terrain layout id of the board to render. The layout must carry a
   * `deployment_pattern_id` (every ported 40kdc board does); demo layouts
   * without one are not missions and throw.
   */
  layoutId: string;
  /** Terrain templates and layouts. Defaults to {@link gwTerrain}. */
  terrain?: TerrainConfig;
  /** Deployment presets to resolve against. Defaults to {@link deployments}. */
  deployments?: Record<string, DeploymentConfig>;
  /** Board size and draw flags. Defaults to {@link baseConfig}. */
  base?: BaseConfig;
  /** Override the grid's `draw` flag without mutating `base`. */
  grid?: boolean;
}

/**
 * Assembles a {@link FullConfig} from a single mission board: the board's
 * `deployment_pattern_id` selects the deployment zones and its layout id
 * selects the buildings, so the two are guaranteed to match. Delegates to
 * {@link buildConfig} once the deployment is resolved.
 *
 * Throws when the layout is unknown, carries no `deployment_pattern_id`, or
 * resolves to a deployment preset that does not exist.
 */
export function buildMissionConfig({
  layoutId,
  terrain = gwTerrain,
  deployments: deploymentSet = deployments,
  base = baseConfig,
  grid,
}: BuildMissionConfigOptions): FullConfig {
  const layout = terrain.layout[layoutId];
  if (!layout) {
    throw new Error(`terrain has no layout named: ${layoutId}`);
  }
  const patternId = layout.deployment_pattern_id;
  if (!patternId) {
    throw new Error(`layout "${layoutId}" has no deployment_pattern_id`);
  }
  const deploymentId = deploymentIdForPattern(patternId);
  const deployment = deploymentSet[deploymentId];
  if (!deployment) {
    throw new Error(
      `no deployment preset for pattern "${patternId}" ` +
        `(looked up "${deploymentId}")`,
    );
  }
  return buildConfig({ mission: deployment, terrain, layout: layoutId, base, grid });
}
