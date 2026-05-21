import type { BuildingPlacement, Template } from "./building-coordinates.js";

export type AreaTerrain = {
  shape: "circle" | "polygon";
  x: number;
  y: number;
  width?: number;   // diameter for circles; bounding-box width for polygons
  height?: number;
  points?: [number, number][];  // polygon-only: template-local closed ring
  label?: string;
  rotation?: number;
};

/** One numbered layout: an ordered list of building placements. */
export type TerrainLayout = {
  buildings: BuildingPlacement[];
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
