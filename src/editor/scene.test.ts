import { describe, it, expect } from "vitest";
import {
  emptyScene,
  sceneToConfig,
  type Scene,
} from "./scene.js";

const RECT_TEMPLATES = {
  "4x6": { width: 4, height: 6 },
  "6x12": { width: 6, height: 12 },
};

describe("sceneToConfig", () => {
  it("returns a valid FullConfig from an empty scene", () => {
    const config = sceneToConfig(emptyScene(), RECT_TEMPLATES);
    expect(config.base.size).toEqual({ width: 60, height: 44 });
    expect(config.deployment.name).toBe("Custom");
    expect(config.terrain.layout_name).toBe("editor");
    expect(config.terrain.layout["editor"].templates).toHaveLength(0);
  });

  it("includes buildings from scene", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "1", type: "building", templateKey: "4x6",
        x: 8, y: 6, rotation: 0, mirror: true,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.terrain.layout["editor"].templates).toHaveLength(1);
    expect(config.terrain.layout["editor"].templates[0].type).toBe("4x6");
  });

  it("omits the mirror key for a mirrored building (renderer default)", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "1", type: "building", templateKey: "4x6",
        x: 8, y: 6, rotation: 0, mirror: true,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.terrain.layout["editor"].templates[0].mirror).toBeUndefined();
  });

  it("emits mirror:false for a non-mirrored building", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "1", type: "building", templateKey: "4x6",
        x: 8, y: 6, rotation: 0, mirror: false,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.terrain.layout["editor"].templates[0].mirror).toBe(false);
  });

  it("uses attacker deployment zone vertices from scene", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "az", type: "deployment-zone", player: "attacker",
        vertices: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 12 }, { x: 0, y: 12 }],
        x: 0, y: 0, rotation: 0,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.deployment.attacker.deployment_zone).toEqual([
      { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 12 }, { x: 0, y: 12 },
    ]);
  });

  it("includes area terrain in terrain config", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "at1", type: "area-terrain", shape: "circle",
        x: 15, y: 15, width: 6, rotation: 0, label: "Forest",
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.terrain.area_terrain).toHaveLength(1);
    expect(config.terrain.area_terrain![0].label).toBe("Forest");
  });

  it("emits a structure-only base (no styling keys)", () => {
    const config = sceneToConfig(emptyScene(), RECT_TEMPLATES);
    expect(config.base).toEqual({
      size: { width: 60, height: 44 },
      half_way_lines: { draw: true },
      building: { draw: false },
      grid: { draw: false },
    });
  });

  it("includes annotations in config", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "ann1", type: "annotation", kind: "text",
        x: 20, y: 20, text: "hello", rotation: 0,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.annotations).toHaveLength(1);
    expect(config.annotations![0].text).toBe("hello");
  });
});

describe("sceneToConfig with icons", () => {
  it("emits layout.editor.icons with pos at the object center", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "ic1", type: "icon", iconType: "skull",
        x: 8, y: 10, rotation: 0,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.terrain.layout["editor"].icons).toEqual([
      { type: "skull", pos: { x: 10, y: 12 } },
    ]);
  });

  it("omits the icons key when there are no icon objects", () => {
    const config = sceneToConfig(emptyScene(), RECT_TEMPLATES);
    expect(config.terrain.layout["editor"].icons).toBeUndefined();
  });

  it("includes the player tag when set", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "ic1", type: "icon", iconType: "fortress",
        x: 8, y: 10, rotation: 0, player: "attacker",
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.terrain.layout["editor"].icons).toEqual([
      { type: "fortress", pos: { x: 10, y: 12 }, player: "attacker" },
    ]);
  });

  it("omits player when the icon has none", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "ic2", type: "icon", iconType: "skull",
        x: 8, y: 10, rotation: 0,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.terrain.layout["editor"].icons).toEqual([
      { type: "skull", pos: { x: 10, y: 12 } },
    ]);
  });
});

describe("sceneToConfig with features", () => {
  it("maps feature objects to the top-level features array", () => {
    const scene = emptyScene();
    scene.objects.push({
      id: "f1",
      type: "feature",
      featureType: "pipe",
      x: 12,
      y: 6,
      width: 10,
      height: 2.5,
      rotation: 45,
      color: "rust",
      mirror: true,
    });
    const config = sceneToConfig(scene, {});
    // mirror:true is the renderer default, so it is omitted from the emitted YAML.
    expect(config.features).toEqual([
      { type: "pipe", x: 12, y: 6, width: 10, height: 2.5, rotation: 45, color: "rust" },
    ]);
  });

  it("emits mirror:false for a non-mirrored feature", () => {
    const scene = emptyScene();
    scene.objects.push({
      id: "f1",
      type: "feature",
      featureType: "pipe",
      x: 12,
      y: 6,
      width: 10,
      height: 2.5,
      rotation: 0,
      color: "rust",
      mirror: false,
    });
    const config = sceneToConfig(scene, {});
    expect(config.features?.[0].mirror).toBe(false);
  });

  it("omits the features key when there are no feature objects", () => {
    const config = sceneToConfig(emptyScene(), {});
    expect(config.features).toBeUndefined();
  });
});

describe("sceneToConfig with centerHoleRadius", () => {
  it("emits mask_center on both players when centerHoleRadius is set", () => {
    const scene: Scene = { ...emptyScene(), centerHoleRadius: 9 };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.deployment.attacker.mask_center).toBe(9);
    expect(config.deployment.defender.mask_center).toBe(9);
  });

  it("omits mask_center when centerHoleRadius is undefined", () => {
    const config = sceneToConfig(emptyScene(), RECT_TEMPLATES);
    expect(config.deployment.attacker.mask_center).toBeUndefined();
    expect(config.deployment.defender.mask_center).toBeUndefined();
  });
});
