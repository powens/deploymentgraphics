import { templateBounds, type BuildingPlacement } from "../building-coordinates.js";
import type { AreaTerrain } from "../terrain-config.js";
import type { Annotation, BaseConfig, DeploymentConfig, FullConfig } from "../types.js";
import type { Template } from "../building-coordinates.js";

export type SceneObjectBase = {
  id: string;
  x: number;   // inches, top-left of unrotated bounding box
  y: number;
  rotation: number;  // degrees 0–359, applied around geometric center
};

export type BuildingObject = SceneObjectBase & {
  type: "building";
  templateKey: string;
  mirror: boolean;
};

export type AreaTerrainObject = SceneObjectBase & {
  type: "area-terrain";
  shape: "circle" | "polygon";
  width?: number;
  height?: number;
  points?: [number, number][];
  label: string;
};

export type ObjectiveObject = SceneObjectBase & {
  type: "objective";
  number: number;
};

export type DeploymentZoneObject = SceneObjectBase & {
  type: "deployment-zone";
  player: "attacker" | "defender";
  vertices: [number, number][];
};

export type AnnotationObject = SceneObjectBase & {
  type: "annotation";
  kind: "text" | "arrow";
  text?: string;
  endX?: number;
  endY?: number;
};

export type SceneObject =
  | BuildingObject
  | AreaTerrainObject
  | ObjectiveObject
  | DeploymentZoneObject
  | AnnotationObject;

export type Scene = {
  boardWidth: number;
  boardHeight: number;
  missionName: string;
  homeEdge: "short" | "long";
  objects: SceneObject[];
};

export function emptyScene(): Scene {
  return {
    boardWidth: 60,
    boardHeight: 44,
    missionName: "Custom",
    homeEdge: "long",
    objects: [],
  };
}

/**
 * Converts a BuildingObject to a BuildingPlacement for the renderer.
 * The corner-pin system encodes rotation as the angle between TL and TR
 * canvas positions — no explicit rotation field is needed in the schema.
 */
export function buildingToPlacement(
  obj: BuildingObject,
  templates: Record<string, Template>,
): BuildingPlacement {
  const template = templates[obj.templateKey];
  if (!template) throw new Error(`unknown template: ${obj.templateKey}`);
  const { width } = templateBounds(template, obj.templateKey);
  const rad = (obj.rotation * Math.PI) / 180;
  const trX = obj.x + width * Math.cos(rad);
  const trY = obj.y + width * Math.sin(rad);
  return {
    type: obj.templateKey,
    corners: {
      TL: [obj.x, obj.y],
      TR: [trX, trY],
    },
    mirror: obj.mirror ? undefined : false,  // mirror defaults to true in renderer
  };
}

const BASE_DEFAULTS: Omit<BaseConfig, "size"> = {
  background: { fill: "#f4f1e8" },
  half_way_lines: {
    svg_properties: {
      stroke: "black",
      stroke_dasharray: "0.5 0.5",
      stroke_width: 0.2,
      opacity: 0.5,
    },
  },
  deployment: {
    attacker: { svg_properties: { fill: "#cf4b33", stroke: "none", stroke_width: 0.4 } },
    defender: { svg_properties: { fill: "#7d8b7f", stroke: "none", stroke_width: 0.4 } },
  },
  building: {
    draw: false,
    svg_properties: { opacity: 1 },
    template: {
      "vector-effect": "non-scaling-stroke",
      stroke: "black",
      stroke_width: 1.2,
      fill: "#808080",
      opacity: 1,
    },
  },
  grid: { draw: false, svg_properties: { opacity: 0.3, stroke: "black", stroke_width: 0.15 } },
};

export function sceneToConfig(
  scene: Scene,
  templates: Record<string, Template>,
): FullConfig {
  const attackerZone = scene.objects.find(
    (o): o is DeploymentZoneObject =>
      o.type === "deployment-zone" && o.player === "attacker",
  );
  const defenderZone = scene.objects.find(
    (o): o is DeploymentZoneObject =>
      o.type === "deployment-zone" && o.player === "defender",
  );

  const buildings = scene.objects
    .filter((o): o is BuildingObject => o.type === "building")
    .map((o) => buildingToPlacement(o, templates));

  const areaTerrainItems: AreaTerrain[] = scene.objects
    .filter((o): o is AreaTerrainObject => o.type === "area-terrain")
    .map((o) => ({
      shape: o.shape,
      x: o.x,
      y: o.y,
      ...(o.width !== undefined && { width: o.width }),
      ...(o.height !== undefined && { height: o.height }),
      ...(o.points !== undefined && { points: o.points }),
      label: o.label,
      rotation: o.rotation,
    }));

  const annotationItems: Annotation[] = scene.objects
    .filter((o): o is AnnotationObject => o.type === "annotation")
    .map((o) => ({
      kind: o.kind,
      x: o.x,
      y: o.y,
      text: o.text,
      endX: o.endX,
      endY: o.endY,
    }));

  // Objectives are not mapped to FullConfig — the renderer has no objectives
  // field since the 11th-edition objective marker system was removed.
  // ObjectiveObject exists in the scene model for future editor use.

  const deployment: DeploymentConfig = {
    name: scene.missionName,
    home_edge: scene.homeEdge,
    attacker: { deployment_zone: attackerZone?.vertices ?? [] },
    defender: { deployment_zone: defenderZone?.vertices ?? [] },
  };

  return {
    base: {
      ...BASE_DEFAULTS,
      size: { width: scene.boardWidth, height: scene.boardHeight },
    },
    deployment,
    terrain: {
      templates,
      layout: { editor: { buildings } },
      layout_name: "editor",
      ...(areaTerrainItems.length > 0 && { area_terrain: areaTerrainItems }),
    },
    ...(annotationItems.length > 0 && { annotations: annotationItems }),
  };
}
