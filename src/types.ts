import type { Point } from "./building-coordinates.js";
import type { FeaturePlacement, TerrainConfig } from "./terrain-config.js";

export type Coordinate = Point;
export type SVGProperties = Record<string, string | number>;

export type Size = { width: number; height: number };

/**
 * Board size and draw toggles. An absent `draw` means on for half-way lines
 * and territory, off for the grid (defaults live in `src/layers.ts`).
 */
export type BaseConfig = {
  size: Size;
  half_way_lines: { draw?: boolean };
  territory: { draw?: boolean };
  grid: { draw?: boolean };
};

export type AttackerDefender = {
  mask_center?: number;
  deployment_zone: Coordinate[];
};

export type DeploymentConfig = {
  name: string;
  territory?: { start: Coordinate; end: Coordinate };
  attacker: AttackerDefender;
  defender: AttackerDefender;
};

/** A `TerrainConfig` plus the selected layout key (`""` for none). */
export type RuntimeTerrainConfig = TerrainConfig & { layout_name: string };

export type Annotation = {
  kind: "text" | "arrow";
  x: number;
  y: number;
  text?: string;
  endX?: number;
  endY?: number;
};

/** A numbered objective marker, positioned by its center in inches. */
export type Objective = {
  x: number;
  y: number;
  number: number;
};

/** Everything a renderer consumes; `buildConfig` assembles one. */
export type FullConfig = {
  base: BaseConfig;
  terrain: RuntimeTerrainConfig;
  deployment: DeploymentConfig;
  objectives?: Objective[];
  annotations?: Annotation[];
  features?: FeaturePlacement[];
};
