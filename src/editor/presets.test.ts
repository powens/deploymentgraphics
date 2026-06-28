import { describe, it, expect } from "vitest";
import { loadPreset } from "./presets.js";
import type {
  AreaTerrainObject,
  FeatureObject,
  IconObject,
} from "./scene.js";

// loadPreset fetches three YAML files by URL substring; this fake returns
// canned objects for each so the loader can be exercised without the network.
type FakeData = {
  mission?: unknown;
  templates?: unknown;
  terrain?: unknown;
};
const fakeFetch =
  (data: FakeData) =>
  async (url: string): Promise<unknown> => {
    if (url.includes("deployment")) return data.mission ?? {};
    if (url.includes("templates-simple")) return data.templates ?? { templates: {} };
    if (url.includes("combined")) return data.terrain ?? { layout: {} };
    throw new Error(`unexpected url: ${url}`);
  };

const mission = {
  name: "Mission",
  home_edge: "long",
  attacker: { deployment_zone: [] },
  defender: { deployment_zone: [] },
};

describe("loadPreset terrain import", () => {
  it("imports layout icons as icon objects positioned by their top-left", async () => {
    const { scene } = await loadPreset(
      "m",
      "1",
      fakeFetch({
        mission,
        terrain: {
          layout: {
            "1": {
              templates: [],
              icons: [
                { type: "skull", pos: { x: 30, y: 22 } },
                {
                  type: "fortress",
                  pos: { x: 46.5, y: 19 },
                  player: "defender",
                  objective_role: "home",
                },
              ],
            },
          },
        },
      }),
    );
    const icons = (scene.objects ?? []).filter(
      (o): o is IconObject => o.type === "icon",
    );
    expect(icons).toHaveLength(2);
    // ICON_SIZE is 4, so the scene's top-left is pos - 2.
    expect(icons[0]).toMatchObject({
      iconType: "skull",
      x: 28,
      y: 20,
    });
    expect(icons[1]).toMatchObject({
      iconType: "fortress",
      x: 44.5,
      y: 17,
      player: "defender",
      objective_role: "home",
    });
  });

  it("imports layout features as feature objects", async () => {
    const { scene } = await loadPreset(
      "m",
      "1",
      fakeFetch({
        mission,
        terrain: {
          layout: {
            "1": {
              templates: [],
              features: [
                {
                  type: "l-ruin",
                  x: 10.5,
                  y: 24.5,
                  width: 7,
                  height: 5,
                  rotation: -90,
                  color: "green",
                  mirror: true,
                },
                {
                  type: "generator",
                  x: 28,
                  y: 21.5,
                  width: 5,
                  height: 3,
                  color: "gunmetal",
                  mirror: false,
                },
              ],
            },
          },
        },
      }),
    );
    const feats = (scene.objects ?? []).filter(
      (o): o is FeatureObject => o.type === "feature",
    );
    expect(feats).toHaveLength(2);
    expect(feats[0]).toMatchObject({
      featureType: "l-ruin",
      x: 10.5,
      y: 24.5,
      width: 7,
      height: 5,
      rotation: -90,
      color: "green",
      mirror: true,
    });
    // mirror:false survives, and an absent rotation defaults to 0.
    expect(feats[1]).toMatchObject({
      featureType: "generator",
      rotation: 0,
      mirror: false,
    });
  });

  it("imports layout area_terrain as area-terrain objects", async () => {
    const { scene } = await loadPreset(
      "m",
      "1",
      fakeFetch({
        mission,
        terrain: {
          layout: {
            "1": {
              templates: [],
              area_terrain: [
                {
                  shape: "polygon",
                  x: 1,
                  y: 2,
                  points: [
                    { x: 0, y: 0 },
                    { x: 3, y: 0 },
                    { x: 0, y: 3 },
                  ],
                  label: "feature",
                },
              ],
            },
          },
        },
      }),
    );
    const at = (scene.objects ?? []).filter(
      (o): o is AreaTerrainObject => o.type === "area-terrain",
    );
    expect(at).toHaveLength(1);
    expect(at[0]).toMatchObject({
      shape: "polygon",
      x: 1,
      y: 2,
      label: "feature",
    });
    expect(at[0].points).toHaveLength(3);
  });

  it("omits icon/feature/area objects when the layout has none", async () => {
    const { scene } = await loadPreset(
      "m",
      "1",
      fakeFetch({
        mission,
        terrain: { layout: { "1": { templates: [] } } },
      }),
    );
    const kinds = (scene.objects ?? []).map((o) => o.type);
    expect(kinds).not.toContain("icon");
    expect(kinds).not.toContain("feature");
    expect(kinds).not.toContain("area-terrain");
  });
});
