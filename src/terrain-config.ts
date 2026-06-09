import type { BuildingPlacement, Point, Template } from "./building-coordinates.js";

/**
 * Default width/height (inches) for area terrain placed without an explicit
 * size. Shared by the renderer (`main.ts`) and the editor (overlay/palette)
 * so a piece dropped at the default size renders at the size its handle box
 * showed.
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
 * colour; absent leaves the neutral theme.icon disk.
 */
export type IconPlacement = {
  type: string;
  pos: Point;
  player?: "attacker" | "defender";
};

/**
 * A placed terrain feature: `type` selects a draw function, `x`/`y` is the
 * top-left of its unrotated bounding box (inches), `width`/`height` its box,
 * `color` a palette key resolved from `theme.feature.palette`, `rotation`
 * degrees about the box center.
 */
export type FeaturePlacement = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color: string;
};

/**
 * One numbered layout: building placements and optional icon markers and
 * terrain features (both drawn on top of the buildings).
 */
export type TerrainLayout = {
  buildings: BuildingPlacement[];
  icons?: IconPlacement[];
  features?: FeaturePlacement[];
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
 * Returns the building placements for a named layout. Throws when the
 * layout does not exist — callers that may be given an unbuilt layout
 * (e.g. a UI selector) must check `terrain.layout[name]` first.
 */
export function getLayoutBuildings(
  terrain: TerrainConfig,
  layoutName: string,
): BuildingPlacement[] {
  const layout = terrain.layout[layoutName];
  if (!layout) {
    throw new Error(`terrain has no layout named: ${layoutName}`);
  }
  return layout.buildings;
}

/**
 * Returns the icon placements for a named layout, or `[]` when the layout is
 * missing or has no icons. Unlike `getLayoutBuildings`, never throws — icons
 * are optional everywhere.
 */
export function getLayoutIcons(
  terrain: TerrainConfig,
  layoutName: string,
): IconPlacement[] {
  return terrain.layout[layoutName]?.icons ?? [];
}

/**
 * Returns the feature placements for a named layout, or `[]` when the layout is
 * missing or has no features. Like `getLayoutIcons`, never throws — features
 * are optional everywhere.
 */
export function getLayoutFeatures(
  terrain: TerrainConfig,
  layoutName: string,
): FeaturePlacement[] {
  return terrain.layout[layoutName]?.features ?? [];
}
