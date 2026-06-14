import { templateBounds, type BuildingPlacement, type Point } from "../building-coordinates.js";
import type { AreaTerrain, FeaturePlacement, IconPlacement } from "../terrain-config.js";
import { ICON_SIZE } from "../icons.js";
import type {
  Annotation,
  DeploymentConfig,
  FullConfig,
  Objective,
} from "../types.js";
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
  points?: Point[];
  label: string;
};

export type ObjectiveObject = SceneObjectBase & {
  type: "objective";
  number: number;
};

export type DeploymentZoneObject = SceneObjectBase & {
  type: "deployment-zone";
  player: "attacker" | "defender";
  vertices: Point[];
};

export type AnnotationObject = SceneObjectBase & {
  type: "annotation";
  kind: "text" | "arrow";
  text?: string;
  endX?: number;
  endY?: number;
};

export type IconObject = SceneObjectBase & {
  type: "icon";
  iconType: "skull" | "fortress";
  player?: "attacker" | "defender";
};

export type FeatureObject = SceneObjectBase & {
  type: "feature";
  featureType: "l-ruin" | "l-ruin-roof" | "generator" | "gantry" | "pipe";
  width: number;
  height: number;
  color: string;
  mirror: boolean;
};

export type SceneObject =
  | BuildingObject
  | AreaTerrainObject
  | ObjectiveObject
  | DeploymentZoneObject
  | AnnotationObject
  | IconObject
  | FeatureObject;

export type Scene = {
  boardWidth: number;
  boardHeight: number;
  missionName: string;
  homeEdge: "short" | "long";
  objects: SceneObject[];
  centerHoleRadius?: number;
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
      TL: { x: obj.x, y: obj.y },
      TR: { x: trX, y: trY },
    },
    mirror: obj.mirror ? undefined : false,  // mirror defaults to true in renderer
  };
}

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

  const objectiveItems: Objective[] = scene.objects
    .filter((o): o is ObjectiveObject => o.type === "objective")
    .map((o) => ({ x: o.x, y: o.y, number: o.number }));

  const iconItems: IconPlacement[] = scene.objects
    .filter((o): o is IconObject => o.type === "icon")
    .map((o) => ({
      type: o.iconType,
      pos: { x: o.x + ICON_SIZE / 2, y: o.y + ICON_SIZE / 2 },
      ...(o.player && { player: o.player }),
    }));

  const featureItems: FeaturePlacement[] = scene.objects
    .filter((o): o is FeatureObject => o.type === "feature")
    .map((o) => ({
      type: o.featureType,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      rotation: o.rotation,
      color: o.color,
      mirror: o.mirror ? undefined : false, // mirror defaults to true in renderer
    }));

  const deployment: DeploymentConfig = {
    name: scene.missionName,
    home_edge: scene.homeEdge,
    attacker: {
      deployment_zone: attackerZone?.vertices ?? [],
      ...(scene.centerHoleRadius ? { mask_center: scene.centerHoleRadius } : {}),
    },
    defender: {
      deployment_zone: defenderZone?.vertices ?? [],
      ...(scene.centerHoleRadius ? { mask_center: scene.centerHoleRadius } : {}),
    },
  };

  return {
    base: {
      size: { width: scene.boardWidth, height: scene.boardHeight },
      half_way_lines: { draw: true },
      building: { draw: false },
      grid: { draw: false },
    },
    deployment,
    terrain: {
      templates,
      layout: {
        editor: {
          templates: buildings,
          ...(iconItems.length > 0 && { icons: iconItems }),
        },
      },
      layout_name: "editor",
      ...(areaTerrainItems.length > 0 && { area_terrain: areaTerrainItems }),
    },
    ...(objectiveItems.length > 0 && { objectives: objectiveItems }),
    ...(annotationItems.length > 0 && { annotations: annotationItems }),
    ...(featureItems.length > 0 && { features: featureItems }),
  };
}
