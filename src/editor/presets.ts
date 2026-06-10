import { resolveBuilding } from "../building-coordinates.js";
import type { Template, BuildingPlacement, Point } from "../building-coordinates.js";
import { missions } from "../presets/missions.js";
import { gwTerrain } from "../presets/terrain.js";
import type { Scene, SceneObject } from "./scene.js";

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
  attacker: { deployment_zone: Point[]; mask_center?: number };
  defender: { deployment_zone: Point[]; mask_center?: number };
};

type TerrainYaml = {
  templates: Record<string, Template>;
  layout: Record<string, { buildings: BuildingPlacement[] }>;
};

export async function loadPreset(
  missionId: string,
  terrainLayoutId: string,
  fetchYaml: (url: string) => Promise<unknown>,
): Promise<{ scene: Partial<Scene>; templates: Record<string, Template> }> {
  const [missionData, terrainData] = (await Promise.all([
    fetchYaml(`./data/deployment/${missionId}.yml`),
    fetchYaml("./data/terrain/gw.yml"),
  ])) as [MissionYaml, TerrainYaml];

  const templates = terrainData.templates ?? {};
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
  if (layout?.buildings) {
    for (const bld of layout.buildings) {
      const template = templates[bld.type];
      if (!template) continue;
      const resolved = resolveBuilding({ ...bld, mirror: false }, templates, canvas);
      if (resolved.length === 0) continue;
      const r = resolved[0];
      objects.push({
        id: `bld-${Math.random().toString(36).slice(2)}`,
        type: "building",
        templateKey: bld.type,
        x: r.translate.x,
        y: r.translate.y,
        rotation: r.rotation,
        mirror: bld.mirror !== false,
      });
    }
  }

  return {
    scene: {
      missionName: missionData.name ?? missionId,
      homeEdge: missionData.home_edge ?? "long",
      objects,
      centerHoleRadius:
        missionData.attacker.mask_center ?? missionData.defender.mask_center,
    },
    templates,
  };
}
