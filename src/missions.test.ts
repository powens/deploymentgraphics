import { describe, expect, it } from "vitest";
import {
  buildMissionIndex,
  deploymentIdForPattern,
  findBoards,
  listDispositions,
} from "./missions.js";
import { buildMissionConfig } from "./presets/build-config.js";
import { deployments } from "./presets/deployments.js";
import { gwTerrain } from "./presets/terrain.js";

describe("buildMissionIndex", () => {
  const index = buildMissionIndex(gwTerrain);

  it("groups the ported layouts into the 11 disposition pairs", () => {
    expect(index).toHaveLength(11);
  });

  it("covers all 30 ported boards across the pairs", () => {
    const total = index.reduce((n, m) => n + m.boards.length, 0);
    expect(total).toBe(30);
  });

  it("excludes demo/basic layouts that carry no dispositions", () => {
    const ids = index.flatMap((m) => m.boards.map((b) => b.layoutId));
    expect(ids).not.toContain("1");
    expect(ids).not.toContain("gw-11e-crucible");
  });

  it("sorts each pair's dispositions and uses an order-insensitive key", () => {
    for (const mission of index) {
      const [a, b] = mission.dispositions;
      expect(a <= b).toBe(true);
      expect(mission.key).toBe([a, b].join("|"));
    }
  });
});

describe("listDispositions", () => {
  it("returns the five distinct dispositions, sorted", () => {
    expect(listDispositions(gwTerrain)).toEqual([
      "Disruption",
      "Priority Assets",
      "Purge the Foe",
      "Reconnaissance",
      "Take and Hold",
    ]);
  });
});

describe("findBoards", () => {
  it("matches a pair regardless of argument order", () => {
    const forward = findBoards(gwTerrain, "Take and Hold", "Purge the Foe");
    const reversed = findBoards(gwTerrain, "Purge the Foe", "Take and Hold");
    expect(forward.length).toBeGreaterThan(0);
    expect(reversed).toEqual(forward);
  });

  it("supports mirror pairs (same disposition twice)", () => {
    const mirror = findBoards(gwTerrain, "Take and Hold", "Take and Hold");
    expect(mirror.length).toBeGreaterThan(0);
    expect(mirror.every((b) => b.layoutId.includes("mirror"))).toBe(true);
  });

  it("returns [] for a pair with no board", () => {
    expect(findBoards(gwTerrain, "Disruption", "Priority Assets")).toEqual([]);
  });
});

describe("deploymentIdForPattern", () => {
  it("converts a hyphenated pattern id to the deployment preset id", () => {
    expect(deploymentIdForPattern("search-and-destroy")).toBe(
      "search_and_destroy",
    );
  });

  it("maps every board's pattern to an existing deployment preset", () => {
    for (const mission of buildMissionIndex(gwTerrain)) {
      for (const board of mission.boards) {
        const id = deploymentIdForPattern(board.deploymentPatternId);
        expect(deployments).toHaveProperty(id);
      }
    }
  });
});

describe("buildMissionConfig", () => {
  it("derives the matching deployment from a board's layout id", () => {
    const config = buildMissionConfig({
      layoutId: "take-and-hold-vs-purge-the-foe-2",
    });
    // search-and-destroy pattern -> search_and_destroy deployment preset.
    expect(config.deployment).toBe(deployments.search_and_destroy);
    expect(config.terrain.layout_name).toBe("take-and-hold-vs-purge-the-foe-2");
  });

  it("throws for a layout without a deployment pattern", () => {
    expect(() => buildMissionConfig({ layoutId: "1" })).toThrow(
      /no deployment_pattern_id/,
    );
  });

  it("throws for an unknown layout", () => {
    expect(() => buildMissionConfig({ layoutId: "nope" })).toThrow(
      /no layout named/,
    );
  });
});
