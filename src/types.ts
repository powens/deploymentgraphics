import type { Point } from "./building-coordinates.js";
import type { FeaturePlacement, TerrainConfig } from "./terrain-config.js";

export type Coordinate = Point;
export type SVGProperties = Record<string, string | number>;

export type Size = { width: number; height: number };

export type BaseConfig = {
  size: Size;
  half_way_lines: { draw?: boolean };
  building: { draw?: boolean };
  grid: { draw?: boolean };
};

export type AttackerDefender = {
  mask_center?: number;
  deployment_zone: Coordinate[];
};

export type DeploymentConfig = {
  name: string;
  home_edge: "short" | "long";
  attacker: AttackerDefender;
  defender: AttackerDefender;
};

/**
 * Terrain config as loaded from combined.yml, plus the `layout_name` the page
 * injects at fetch time (see static/index.html `getTerrain`).
 */
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

/** The whole config object built by static/index.html. */
export type FullConfig = {
  base: BaseConfig;
  terrain: RuntimeTerrainConfig;
  deployment: DeploymentConfig;
  objectives?: Objective[];
  annotations?: Annotation[];
  features?: FeaturePlacement[];
};
