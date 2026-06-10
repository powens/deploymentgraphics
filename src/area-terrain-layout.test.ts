// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { makeMissionCard } from "./main";
import type { FullConfig } from "./types";

function configWithLayout(): FullConfig {
  return {
    base: {
      size: { width: 60, height: 44 },
      half_way_lines: { draw: false },
      building: { draw: true },
      grid: { draw: false },
    },
    terrain: {
      layout_name: "dc",
      templates: {},
      layout: {
        dc: {
          buildings: [],
          area_terrain: [
            {
              shape: "polygon",
              x: 0,
              y: 0,
              label: "area",
              points: [
                { x: 24.25, y: 18.5 },
                { x: 35.75, y: 18.5 },
                { x: 35.75, y: 25.5 },
                { x: 24.25, y: 25.5 },
              ],
            },
          ],
          objectives: [{ x: 30, y: 22, number: 1 }],
        },
      },
    },
    deployment: {
      name: "Test",
      home_edge: "long",
      attacker: { deployment_zone: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 10 }] },
      defender: { deployment_zone: [{ x: 0, y: 44 }, { x: 60, y: 44 }, { x: 60, y: 34 }] },
    },
  } as unknown as FullConfig;
}

describe("per-layout area terrain + objectives", () => {
  it("renders the layout's area_terrain polygon", () => {
    const svg = makeMissionCard(configWithLayout());
    const group = svg.querySelector("#area-terrain");
    expect(group).not.toBeNull();
    expect(group!.querySelectorAll("polygon").length).toBe(1);
  });

  it("renders the layout's objective marker", () => {
    const svg = makeMissionCard(configWithLayout());
    const group = svg.querySelector("#objectives");
    expect(group).not.toBeNull();
    expect(group!.querySelectorAll("circle").length).toBe(1);
  });
});
