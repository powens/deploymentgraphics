import { describe, it, expect } from "vitest";
import {
  emptyScene,
  sceneToConfig,
  buildingToPlacement,
  type BuildingObject,
  type Scene,
} from "./scene.js";

const RECT_TEMPLATES = {
  "4x6": { width: 4, height: 6 },
  "6x12": { width: 6, height: 12 },
};

describe("buildingToPlacement", () => {
  it("produces axis-aligned corners for rotation 0", () => {
    const obj: BuildingObject = {
      id: "a", type: "building", templateKey: "4x6",
      x: 10, y: 8, rotation: 0, mirror: true,
    };
    const p = buildingToPlacement(obj, RECT_TEMPLATES);
    expect(p.type).toBe("4x6");
    expect(p.corners.TL).toEqual([10, 8]);
    expect((p.corners.TR as number[])[0]).toBeCloseTo(14, 5);
    expect((p.corners.TR as number[])[1]).toBeCloseTo(8, 5);
  });

  it("rotates TR corner 90 degrees", () => {
    const obj: BuildingObject = {
      id: "b", type: "building", templateKey: "4x6",
      x: 10, y: 8, rotation: 90, mirror: false,
    };
    const p = buildingToPlacement(obj, RECT_TEMPLATES);
    // TR = [x + w*cos(90°), y + w*sin(90°)] = [10, 12]
    expect((p.corners.TR as number[])[0]).toBeCloseTo(10, 5);
    expect((p.corners.TR as number[])[1]).toBeCloseTo(12, 5);
  });

  it("sets mirror: false when obj.mirror is false", () => {
    const obj: BuildingObject = {
      id: "c", type: "building", templateKey: "4x6",
      x: 5, y: 5, rotation: 0, mirror: false,
    };
    expect(buildingToPlacement(obj, RECT_TEMPLATES).mirror).toBe(false);
  });

  it("omits mirror key when obj.mirror is true", () => {
    const obj: BuildingObject = {
      id: "d", type: "building", templateKey: "4x6",
      x: 5, y: 5, rotation: 0, mirror: true,
    };
    expect(buildingToPlacement(obj, RECT_TEMPLATES).mirror).toBeUndefined();
  });
});

describe("sceneToConfig", () => {
  it("returns a valid FullConfig from an empty scene", () => {
    const config = sceneToConfig(emptyScene(), RECT_TEMPLATES);
    expect(config.base.size).toEqual({ width: 60, height: 44 });
    expect(config.deployment.name).toBe("Custom");
    expect(config.terrain.layout_name).toBe("editor");
    expect(config.terrain.layout["editor"].buildings).toHaveLength(0);
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
    expect(config.terrain.layout["editor"].buildings).toHaveLength(1);
    expect(config.terrain.layout["editor"].buildings[0].type).toBe("4x6");
  });

  it("uses attacker deployment zone vertices from scene", () => {
    const scene: Scene = {
      ...emptyScene(),
      objects: [{
        id: "az", type: "deployment-zone", player: "attacker",
        vertices: [[0, 0], [60, 0], [60, 12], [0, 12]],
        x: 0, y: 0, rotation: 0,
      }],
    };
    const config = sceneToConfig(scene, RECT_TEMPLATES);
    expect(config.deployment.attacker.deployment_zone).toEqual([
      [0, 0], [60, 0], [60, 12], [0, 12],
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
