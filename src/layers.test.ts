import { describe, it, expect } from "vitest";
import { cardLayers, resolveLayout } from "./layers";
import { baseTheme } from "./presets/theme.js";
import type { FullConfig } from "./types";

/** A FullConfig with a selected layout "1" carrying one of each piece. */
function configWith(over: Partial<FullConfig> = {}): FullConfig {
  return {
    base: {
      size: { width: 60, height: 44 },
      half_way_lines: {},
      territory: {},
      grid: {},
    },
    terrain: {
      layout_name: "1",
      templates: { "4x6": { width: 4, height: 6 } },
      layout: {
        "1": {
          templates: [{ type: "4x6", corners: { TL: { x: 10, y: 0 } } }],
          icons: [{ type: "skull", pos: { x: 5, y: 5 } }],
          features: [
            { type: "l-ruin", x: 1, y: 1, width: 3, height: 3, color: "rust" },
          ],
        },
      },
    },
    deployment: {
      name: "Test",
      attacker: { deployment_zone: [] },
      defender: { deployment_zone: [] },
    },
    ...over,
  };
}

describe("resolveLayout", () => {
  it("returns the selected layout's buildings and icons", () => {
    const r = resolveLayout(configWith());
    expect(r.buildings).toHaveLength(1);
    expect(r.buildings[0].type).toBe("4x6");
    expect(r.icons).toHaveLength(1);
    expect(r.icons[0].type).toBe("skull");
  });

  it("returns empty buildings and icons when no layout is selected", () => {
    const config = configWith();
    config.terrain.layout_name = "99";
    const r = resolveLayout(config);
    expect(r.buildings).toEqual([]);
    expect(r.icons).toEqual([]);
  });

  it("returns empty arrays for a selected layout that omits the optional pieces", () => {
    const config = configWith();
    config.terrain.layout["1"] = { templates: [] };
    const r = resolveLayout(config);
    expect(r.buildings).toEqual([]);
    expect(r.icons).toEqual([]);
    expect(r.features).toEqual([]);
  });

  it("unions top-level features before the layout's features", () => {
    const config = configWith();
    config.features = [
      { type: "generator", x: 0, y: 0, width: 2, height: 2, color: "gunmetal" },
    ];
    const r = resolveLayout(config);
    // top-level first, then the layout's — order matters for draw order.
    expect(r.features.map((f) => f.type)).toEqual(["generator", "l-ruin"]);
  });

  it("still surfaces top-level features when no layout is selected", () => {
    const config = configWith();
    config.terrain.layout_name = "99";
    config.features = [
      { type: "generator", x: 0, y: 0, width: 2, height: 2, color: "gunmetal" },
    ];
    const r = resolveLayout(config);
    expect(r.features).toHaveLength(1);
  });
});

describe("cardLayers draw defaults", () => {
  const TERRITORY = { start: { x: 0, y: 22 }, end: { x: 60, y: 22 } };

  /** The layers that survive their own presence rule, in draw order. */
  function drawnIds(config: FullConfig): string[] {
    return cardLayers(config, baseTheme).map((layer) => layer.id);
  }

  function withTerritory(over: Partial<FullConfig["base"]> = {}): FullConfig {
    const config = configWith();
    config.base = { ...config.base, ...over };
    config.deployment.territory = TERRITORY;
    return config;
  }

  // `configWith` leaves all three toggles `{}`. What an absent `draw` means is
  // a per-toggle decision and `layers.ts` is its one owner, so each default is
  // pinned here — otherwise flipping one in that list breaks no test.
  it("defaults the half-way lines and the territory line on, and the grid off", () => {
    const ids = drawnIds(withTerritory());
    expect(ids).toContain("half-way-lines");
    expect(ids).toContain("territory");
    expect(ids).not.toContain("grid");
  });

  it("lets an explicit `draw` override each default", () => {
    const ids = drawnIds(
      withTerritory({
        grid: { draw: true },
        half_way_lines: { draw: false },
        territory: { draw: false },
      }),
    );
    expect(ids).toContain("grid");
    expect(ids).not.toContain("half-way-lines");
    expect(ids).not.toContain("territory");
  });

  // The territory row is two rules, not one: no mission territory means no
  // line whatever the toggle says.
  it("draws no territory line for a mission with no territory", () => {
    const config = configWith();
    config.base = { ...config.base, territory: { draw: true } };
    expect(drawnIds(config)).not.toContain("territory");
  });
});
