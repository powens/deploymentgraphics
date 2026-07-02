import type { Point } from "../building-coordinates.js";
import {
  decomposeBuilding,
  toMirrorFlag,
  type ResolvedBuilding,
} from "../placement.js";
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
  // degrees 0–359. Buildings rotate about their top-left (origin-pivot, see
  // CONTEXT.md); features rotate about their box centre, matching the renderer.
  rotation: number;
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
  // Ported 40kdc objective role; carried for round-trip fidelity (see
  // IconPlacement in terrain-config.ts).
  objective_role?: "center" | "home" | "expansion";
};

export type FeatureType =
  | "l-ruin"
  | "l-ruin-mirror"
  | "l-ruin-roof"
  | "l-ruin-roof-mirror"
  | "generator"
  | "gantry"
  | "pipe";

export type FeatureObject = SceneObjectBase & {
  type: "feature";
  featureType: FeatureType;
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
  territory?: { start: Point; end: Point };
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

// --- Scene transforms ------------------------------------------------------
// Pure, immutable edits to a scene's object list. The editor's event handlers
// own *when* to apply and re-render; these own *what changes*, so the logic is
// unit-testable instead of trapped in the controller.

/**
 * Returns a scene with `patch` merged into the object whose id matches; a no-op
 * (structurally equal) when no object matches. The one place the discriminated
 * union is widened by a patch merge, so call sites stay cast-free.
 */
export function updateObject(
  scene: Scene,
  id: string,
  patch: Partial<SceneObject>,
): Scene {
  return {
    ...scene,
    objects: scene.objects.map((o) =>
      o.id === id ? ({ ...o, ...patch } as SceneObject) : o,
    ),
  };
}

/** Returns a scene without the object whose id matches. */
export function removeObject(scene: Scene, id: string): Scene {
  return { ...scene, objects: scene.objects.filter((o) => o.id !== id) };
}

/** Returns a scene with `obj` appended (last = drawn on top). */
export function addObject(scene: Scene, obj: SceneObject): Scene {
  return { ...scene, objects: [...scene.objects, obj] };
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
    .map((o) => {
      const resolved: ResolvedBuilding = {
        templateName: o.templateKey,
        translate: { x: o.x, y: o.y },
        rotation: o.rotation,
      };
      return {
        ...decomposeBuilding(resolved, templates),
        mirror: toMirrorFlag(o.mirror),
      };
    });

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
      ...(o.objective_role && { objective_role: o.objective_role }),
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
      mirror: toMirrorFlag(o.mirror),
    }));

  const deployment: DeploymentConfig = {
    name: scene.missionName,
    home_edge: scene.homeEdge,
    ...(scene.territory ? { territory: scene.territory } : {}),
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
      territory: { draw: true },
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
