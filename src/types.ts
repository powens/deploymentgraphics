export type Coordinate = [number, number];
export type BuildingCoordinate = [Coordinate, Coordinate];
export type SVGProperties = Record<string, string | number>;

export type Size = {
  width: number;
  height: number;
};

export type DrawAndProperties = {
  draw?: boolean;
  radius?: number;
  svg_properties: SVGProperties;
};

/**
 * Base configs
 */

export type Objective = {
  guides: GuideLine;
  stylized: DrawAndProperties;
  real: DrawAndProperties;
  influence: DrawAndProperties;
};

export type Attacker = {
  svg_properties: SVGProperties;
};

export type Defender = {
  svg_properties: SVGProperties;
};

export type Building = {
  draw: boolean;
  svg_properties: SVGProperties;
  template: SVGProperties;
  structure: SVGProperties;
};

export type Grid = {
  draw: boolean;
  svg_properties: SVGProperties;
};

export type GuideLine = {
  line: DrawAndProperties;
  text: DrawAndProperties;
};

export type BaseDeployment = {
  attacker: Attacker;
  defender: Defender;
};

export type BaseConfig = {
  half_way_lines: DrawAndProperties;
  size: Size;
  objective: Objective;
  deployment: BaseDeployment;
  building: Building;
  grid: Grid;
  background: SVGProperties;
};

/**
 * Terrain configs
 */

export type TerrainTemplate = {
  template: Size;
};

export type TerrainLayoutItem = {
  type: string;
  coords: BuildingCoordinate;
};

export type TerrainLayout = {
  buildings: TerrainLayoutItem[];
};

export type TerrainConfig = {
  layout_name: string;
  templates: Record<string, TerrainTemplate>;
  layout: Record<string, TerrainLayout>;
};

/**
 * Deployment configs
 */

export type AttackerDefender = {
  mask_center: number;
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
 * FullConfig
 */

export type FullConfig = {
  base: BaseConfig;
  terrain: TerrainConfig;
  deployment: DeploymentConfig;
};
