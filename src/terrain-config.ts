import type { BuildingPlacement, Template } from "./building-coordinates";

/** One numbered layout: an ordered list of building placements. */
export type TerrainLayout = {
  buildings: BuildingPlacement[];
};

/**
 * A terrain file as parsed from YAML: a set of named building templates
 * (rectangles or polygon footprints) and a set of numbered layouts.
 * Layout keys are strings because YAML integer keys become string object
 * properties once loaded.
 */
export type TerrainConfig = {
  templates: Record<string, Template>;
  layout: Record<string, TerrainLayout>;
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
