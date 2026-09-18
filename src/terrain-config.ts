import type { BuildingPlacement, Point, Template } from "./building-coordinates.js";

/**
 * A placed icon marker: `type` selects a predefined icon, `pos` is its center
 * (inches). An optional `player` tints the disk with that player's deployment
 * colour; absent leaves the neutral theme.icon disk. `objective_role` carries
 * the ported 40kdc objective role (center / home / expansion) for markers
 * derived from objective pieces; it selects the icon (home → fortress) at
 * conversion time and is retained for any downstream use.
 */
export type IconPlacement = {
  type: string;
  pos: Point;
  player?: "attacker" | "defender";
  objective_role?: "center" | "home" | "expansion";
};

/**
 * A placed terrain feature: `type` selects a draw function, `x`/`y` is the
 * top-left of its unrotated bounding box (inches), `width`/`height` its box,
 * `color` a palette key resolved from `theme.feature.palette`, `rotation`
 * degrees about the box center. Like buildings, a feature is mirrored 180°
 * through the canvas centre unless `mirror: false`.
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

/**
 * One numbered layout: building placements and optional icon markers and
 * terrain features (drawn on top of the buildings).
 */
export type TerrainLayout = {
  // Building placements for this layout. Named `templates` in the YAML
  // because each placement references a building template by `type:`.
  templates: BuildingPlacement[];
  icons?: IconPlacement[];
  features?: FeaturePlacement[];
  // The two mission dispositions this layout's matchup pairs (e.g.
  // ["Take and Hold", "Purge the Foe"]), ported from the 40kdc
  // `mission_matchup_id`. Absent on layouts with no matchup.
  dispositions?: string[];
  // The 40kdc `deployment_pattern_id` (e.g. "hammer-and-anvil"). The renderer
  // never reads it; `resolveTerrainLayout` joins on it, with `dispositions`, to
  // pick the layout for a mission pairing.
  deployment_pattern_id?: string;
};

/**
 * A terrain file as parsed from YAML: a set of named building templates
 * (rectangles, polygon footprints, or curved path footprints) and a set
 * of numbered layouts. Layout keys are strings because YAML integer keys
 * become string object properties once loaded.
 */
export type TerrainConfig = {
  templates: Record<string, Template>;
  layout: Record<string, TerrainLayout>;
};

// The pieces of a selected layout are assembled by `resolveLayout` in
// `layout.ts` (which unions them with the board's top-level arrays), not by
// per-piece accessors here.
