import type { BuildingPlacement, Point, Template } from "./building-coordinates.js";

/**
 * Default width/height (inches) for area terrain placed without an explicit
 * size.
 */
export const DEFAULT_AREA_TERRAIN_SIZE = 6;

export type AreaTerrain = {
  shape: "circle" | "polygon";
  x: number;
  y: number;
  width?: number;   // diameter for circles; bounding-box width for polygons
  height?: number;
  points?: Point[];  // polygon-only: template-local closed ring
  label?: string;
  rotation?: number;
};

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
  // Material category, shared with area_terrain labels (ruin, pipe, generator,
  // barricade, gantry, catwalk). Currently styling comes from `color`; the
  // label is carried for consistency with the ported 40kdc pieces.
  label?: string;
};

/**
 * One numbered layout: building placements and optional icon markers and
 * terrain features (drawn on top of the buildings). Layouts ported from
 * external data may instead carry `area_terrain` polygons.
 */
export type TerrainLayout = {
  // Building placements for this layout. Named `templates` in the YAML
  // because each placement references a building template by `type:`.
  templates: BuildingPlacement[];
  icons?: IconPlacement[];
  features?: FeaturePlacement[];
  area_terrain?: AreaTerrain[];
  // The two mission dispositions this layout's matchup pairs (e.g.
  // ["Take and Hold", "Purge the Foe"]), ported from the 40kdc
  // `mission_matchup_id`. Absent on layouts with no matchup.
  dispositions?: string[];
  // The 40kdc `deployment_pattern_id` (e.g. "hammer-and-anvil"). Carried for
  // downstream use; currently unread by the renderer.
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
  area_terrain?: AreaTerrain[];
};

/**
 * Reunites the two halves of a terrain config into one `TerrainConfig`: a
 * templates file (`templates-simple.yml` or `templates-real.yml`) and a layouts
 * file (`combined.yml`). The two are authored separately — both template files
 * define the same template names, so any layout renders against either set —
 * and this is the single place they come together. Used by the browser app and
 * mirrored by `gen:presets` for the bundled `gwTerrain`.
 */
export function mergeTerrain(
  templates: Pick<TerrainConfig, "templates">,
  layouts: Omit<TerrainConfig, "templates">,
): TerrainConfig {
  return { ...templates, ...layouts };
}

// The pieces of a selected layout are assembled by `resolveLayout` in
// `layout.ts` (which unions them with the board's top-level arrays), not by
// per-piece accessors here.
