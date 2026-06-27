import type { BuildingPlacement } from "./building-coordinates.js";
import type {
  AreaTerrain,
  FeaturePlacement,
  IconPlacement,
} from "./terrain-config.js";
import type { FullConfig } from "./types.js";

/**
 * The board pieces a render pass actually draws, with the "is a layout
 * selected?" and "top-level array unioned with the layout's?" rules already
 * applied. `buildings` and `icons` come from the selected layout alone (empty
 * when none is selected); `features` and `areaTerrain` union the board's
 * top-level arrays with the layout's, so they draw with or without a layout.
 *
 * This is "layout-resolution" — assembling placement arrays — distinct from
 * `Resolve` in CONTEXT.md, which maps a single placement to a `Placed`.
 */
export type ResolvedLayout = {
  buildings: BuildingPlacement[];
  icons: IconPlacement[];
  features: FeaturePlacement[];
  areaTerrain: AreaTerrain[];
};

/**
 * Collects the pieces to draw for `config`'s selected layout. Always returns a
 * `ResolvedLayout` — an unbuilt layout yields empty `buildings`/`icons` rather
 * than throwing — so callers never guard on layout existence. The union order
 * is top-level first, then the layout's, matching draw order.
 */
export function resolveLayout(config: FullConfig): ResolvedLayout {
  const layout = config.terrain.layout[config.terrain.layout_name];
  return {
    buildings: layout?.templates ?? [],
    icons: layout?.icons ?? [],
    features: [...(config.features ?? []), ...(layout?.features ?? [])],
    areaTerrain: [
      ...(config.terrain.area_terrain ?? []),
      ...(layout?.area_terrain ?? []),
    ],
  };
}
