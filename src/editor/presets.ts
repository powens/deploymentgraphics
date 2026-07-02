import { fromMirrorFlag, resolveBuilding } from "../placement.js";
import type { Template, BuildingPlacement, Point } from "../building-coordinates.js";
import type { AreaTerrain, FeaturePlacement, IconPlacement } from "../terrain-config.js";
import { ICON_SIZE } from "../icons.js";
import { missions } from "../presets/missions.js";
import { gwTerrain } from "../presets/terrain.js";
import type { FeatureType, Scene, SceneObject } from "./scene.js";

// Derived from the generated presets so the mission/layout lists can never
// drift from the YAML they come from (see scripts/gen-presets.mjs).
export const MISSIONS = Object.entries(missions).map(([id, m]) => ({
  id,
  label: m.name,
}));

export const TERRAIN_LAYOUTS = Object.keys(gwTerrain.layout).map((id) => ({
  id,
  label: `GW Layout ${id}`,
}));

type MissionYaml = {
  name: string;
  home_edge: "short" | "long";
  territory?: { start: Point; end: Point };
  attacker: { deployment_zone: Point[]; mask_center?: number };
  defender: { deployment_zone: Point[]; mask_center?: number };
};

type TemplatesYaml = {
  templates: Record<string, Template>;
};

type TerrainYaml = {
  layout: Record<
    string,
    {
      templates: BuildingPlacement[];
      icons?: IconPlacement[];
      features?: FeaturePlacement[];
      area_terrain?: AreaTerrain[];
    }
  >;
};

const genId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2)}`;

/** The two interchangeable building-template sets, mirroring the viewer's `tpl`
 * control. Both files define the same template names, so any layout renders
 * against either. */
export type TemplateSet = "simple" | "real";

export const templatesUrl = (set: TemplateSet): string =>
  `./data/terrain/templates-${set}.yml`;

export async function loadPreset(
  missionId: string,
  terrainLayoutId: string,
  fetchYaml: (url: string) => Promise<unknown>,
  templateSet: TemplateSet = "simple",
): Promise<{ scene: Partial<Scene>; templates: Record<string, Template> }> {
  const [missionData, templateData, terrainData] = (await Promise.all([
    fetchYaml(`./data/deployment/${missionId}.yml`),
    fetchYaml(templatesUrl(templateSet)),
    fetchYaml("./data/terrain/combined.yml"),
  ])) as [MissionYaml, TemplatesYaml, TerrainYaml];

  const templates = templateData.templates ?? {};
  const canvas = { width: 60, height: 44 };
  const objects: SceneObject[] = [];

  objects.push({
    id: "dz-attacker",
    type: "deployment-zone",
    player: "attacker",
    vertices: missionData.attacker.deployment_zone ?? [],
    x: 0, y: 0, rotation: 0,
  });
  objects.push({
    id: "dz-defender",
    type: "deployment-zone",
    player: "defender",
    vertices: missionData.defender.deployment_zone ?? [],
    x: 0, y: 0, rotation: 0,
  });

  const layout = terrainData.layout?.[terrainLayoutId];
  if (layout?.templates) {
    for (const bld of layout.templates) {
      const template = templates[bld.type];
      if (!template) continue;
      const resolved = resolveBuilding({ ...bld, mirror: false }, templates, canvas);
      if (resolved.length === 0) continue;
      const r = resolved[0];
      objects.push({
        id: genId("bld"),
        type: "building",
        templateKey: bld.type,
        x: r.translate.x,
        y: r.translate.y,
        rotation: r.rotation,
        mirror: fromMirrorFlag(bld.mirror),
      });
    }
  }

  // Icons, features, and area terrain are placed in board coordinates already,
  // so they map straight to scene objects — only an icon's center `pos` is
  // converted to the scene's top-left box origin.
  for (const icon of layout?.icons ?? []) {
    objects.push({
      id: genId("icon"),
      type: "icon",
      iconType: icon.type as "skull" | "fortress",
      x: icon.pos.x - ICON_SIZE / 2,
      y: icon.pos.y - ICON_SIZE / 2,
      rotation: 0,
      ...(icon.player && { player: icon.player }),
      ...(icon.objective_role && { objective_role: icon.objective_role }),
    });
  }

  for (const feat of layout?.features ?? []) {
    objects.push({
      id: genId("feat"),
      type: "feature",
      featureType: feat.type as FeatureType,
      x: feat.x,
      y: feat.y,
      width: feat.width,
      height: feat.height,
      rotation: feat.rotation ?? 0,
      color: feat.color,
      mirror: fromMirrorFlag(feat.mirror),
    });
  }

  for (const at of layout?.area_terrain ?? []) {
    objects.push({
      id: genId("at"),
      type: "area-terrain",
      shape: at.shape,
      x: at.x,
      y: at.y,
      rotation: at.rotation ?? 0,
      label: at.label ?? "feature",
      ...(at.width !== undefined && { width: at.width }),
      ...(at.height !== undefined && { height: at.height }),
      ...(at.points !== undefined && { points: at.points }),
    });
  }

  return {
    scene: {
      missionName: missionData.name ?? missionId,
      homeEdge: missionData.home_edge ?? "long",
      objects,
      centerHoleRadius:
        missionData.attacker.mask_center ?? missionData.defender.mask_center,
      ...(missionData.territory ? { territory: missionData.territory } : {}),
    },
    templates,
  };
}
