import type { BuildingPlacement, Point, Template } from "./building-coordinates.js";

/**
 * A placed icon marker: `type` selects a predefined icon, `pos` is its center
 * (inches). An optional `player` tints the disk with that player's deployment
 * colour; absent leaves the neutral theme.icon disk.
 */
export type IconPlacement = {
  type: string;
  pos: Point;
  player?: "attacker" | "defender";
};

/**
 * A placed terrain feature: `type` selects a draw function, `x`/`y` is the
 * top-left of the unrotated box (inches), `color` a `theme.feature.palette`
 * key, `rotation` degrees about the box centre. Mirrored through the canvas
 * centre unless `mirror: false`.
 */
export type FeaturePlacement = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color: string;
  mirror?: boolean; // default true
};

/** One numbered layout: building placements, icon markers and features. */
export type TerrainLayout = {
  // Building placements; each references a template by `type`.
  templates: BuildingPlacement[];
  icons?: IconPlacement[];
  features?: FeaturePlacement[];
  // The matchup's two dispositions, from the 40kdc `mission_matchup_id`.
  dispositions?: string[];
  // e.g. "hammer-and-anvil". Not rendered; `resolveTerrainLayout` matches on it.
  deployment_pattern_id?: string;
};

/**
 * A terrain file as parsed from YAML: named building templates and numbered
 * layouts. Layout keys are strings because loaded YAML integer keys are.
 */
export type TerrainConfig = {
  templates: Record<string, Template>;
  layout: Record<string, TerrainLayout>;
};

/**
 * The layout `name` selects from `layouts`, or `undefined` for `""` (no
 * layout). Throws on any other id `layouts` does not own: a mistyped or stale
 * id would otherwise render a bare board that looks deliberate. With no
 * layouts at all the likely cause is a layout named without its terrain, so
 * the message says to pass one.
 */
export function selectLayout(
  layouts: Record<string, TerrainLayout>,
  name: string,
): TerrainLayout | undefined {
  if (name === "") return undefined;
  if (Object.hasOwn(layouts, name)) return layouts[name];
  const why =
    Object.keys(layouts).length === 0
      ? "terrain.layout is empty; pass the terrain that defines it " +
        "(e.g. terrain: gwTerrain)"
      : "not a key of terrain.layout";
  throw new Error(`unknown layout ${JSON.stringify(name)}: ${why}`);
}
