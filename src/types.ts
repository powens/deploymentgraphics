import type { TerrainConfig } from "./terrain-config";

export type Coordinate = [number, number];
export type SVGProperties = Record<string, string | number>;
export type AnchorLocation =
  | "TOP_LEFT"
  | "TOP_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_RIGHT";

export type Size = { width: number; height: number };

export type DrawAndProperties = {
  draw?: boolean;
  radius?: number;
  svg_properties: SVGProperties;
};

export type GuideLine = {
  line: DrawAndProperties;
  text: DrawAndProperties;
};

export type Objective = {
  guides: GuideLine;
  stylized: DrawAndProperties;
  real: DrawAndProperties;
  influence: DrawAndProperties;
};

export type Attacker = { svg_properties: SVGProperties };
export type Defender = { svg_properties: SVGProperties };
export type BaseDeployment = { attacker: Attacker; defender: Defender };

export type Building = {
  draw: boolean;
  svg_properties: SVGProperties;
  template: SVGProperties;
  structure: SVGProperties;
};

export type Grid = { draw: boolean; svg_properties: SVGProperties };

export type BaseConfig = {
  half_way_lines: DrawAndProperties;
  size: Size;
  objective: Objective;
  deployment: BaseDeployment;
  building: Building;
  grid: Grid;
  background: SVGProperties;
};

export type AttackerDefender = {
  mask_center?: number;
  deployment_zone: Coordinate[];
};

export type DeploymentConfig = {
  name: string;
  home_edge: "short" | "long";
  hidden_supplies?: boolean;
  attacker: AttackerDefender;
  defender: AttackerDefender;
  objectives: Coordinate[];
};

/**
 * Terrain config as loaded from gw.yml, plus the `layout_name` the page
 * injects at fetch time (see static/index.html `getTerrain`).
 */
export type RuntimeTerrainConfig = TerrainConfig & { layout_name: string };

/** The whole config object built by static/index.html. */
export type FullConfig = {
  base: BaseConfig;
  terrain: RuntimeTerrainConfig;
  deployment: DeploymentConfig;
};
