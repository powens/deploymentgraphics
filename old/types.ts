export type Coordinate = [number, number];
export type AnchoredCoordinate = {
  position: Coordinate;
  anchor: string;
};
export type BattlefieldEdge = "short" | "long";
export type Size = {
  width: number;
  height: number;
};

export type SvgItemStyles = {
  fill: string;
  stroke: string;
  stroke_dasharray?: string;
  stroke_width?: string;
  opacity?: number;
};

export type ObjectiveConfig = {
  // TODO: Real records
  guides: Record<string, string>;
  stylized: Record<string, string>;
  real: Record<string, string>;
  influence: Record<string, string>;
};

export type AttackerDefender = SvgItemStyles & {
  deployment_zone: Coordinate[];
  mask_center: number;
};

export type BuildingConfig = {
  render: boolean;
  opacity: number;
  template: SvgItemStyles;
  structure: SvgItemStyles;
};

export type GridConfig = SvgItemStyles & {
  draw: boolean;
};

export type BaseConfig = {
  size: Size;
  guide_line: SvgItemStyles;
  objective: ObjectiveConfig;
  attacker: AttackerDefender;
  defender: AttackerDefender;
  building: BuildingConfig;
  grid: GridConfig;

  fill: string;
};

export type MissionConfig = {
  name: string;
  home_edge: BattlefieldEdge;
  attacker: AttackerDefender;
  defender: AttackerDefender;
  objectives: Coordinate[];
};

export type TerrainConfig = {
  buildings: Record<string, BuildingConfig>;
  layout: Record<string, any>;
};

export type FullConfig = {
  base: BaseConfig;
  mission: MissionConfig;
  terrain: TerrainConfig;
};
