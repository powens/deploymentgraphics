import { describe, expect, it } from "vitest";
import {
  type Layout,
  dispositions,
  eventMatrixKey,
  resolveMission,
  resolveTerrainLayout,
} from "./event-matrix.js";
import { eventMatrix } from "./presets/event-matrix.js";
import { gwTerrain } from "./presets/terrain.js";
import { missions } from "./presets/missions.js";

describe("eventMatrixKey", () => {
  it("is order-independent", () => {
    expect(eventMatrixKey("Take and Hold", "Disruption")).toBe(
      eventMatrixKey("Disruption", "Take and Hold"),
    );
  });

  it("sorts and joins with ' | '", () => {
    expect(eventMatrixKey("Reconnaissance", "Disruption")).toBe(
      "Disruption | Reconnaissance",
    );
  });
});

describe("resolveMission", () => {
  it("resolves every disposition pair x layout to a real mission id", () => {
    const ds = dispositions(eventMatrix);
    const layouts: Layout[] = ["A", "B", "C"];
    for (const a of ds) {
      for (const b of ds) {
        for (const layout of layouts) {
          const id = resolveMission(eventMatrix, a, b, layout);
          expect(missions).toHaveProperty(id);
        }
      }
    }
  });

  it("resolves the same regardless of disposition order", () => {
    for (const layout of ["A", "B", "C"] as Layout[]) {
      expect(resolveMission(eventMatrix, "Disruption", "Take and Hold", layout)).toBe(
        resolveMission(eventMatrix, "Take and Hold", "Disruption", layout),
      );
    }
  });

  it("throws for an unknown pairing", () => {
    expect(() => resolveMission(eventMatrix, "Nope", "Take and Hold", "A")).toThrow();
  });
});

describe("dispositions", () => {
  it("returns the sorted unique dispositions", () => {
    expect(dispositions(eventMatrix)).toEqual([
      "Disruption",
      "Priority Assets",
      "Purge the Foe",
      "Reconnaissance",
      "Take and Hold",
    ]);
  });
});

describe("resolveTerrainLayout", () => {
  const meta = {
    "take-and-hold-vs-disruption-1": {
      dispositions: ["Take and Hold", "Disruption"],
      deployment_pattern_id: "sweeping-engagement",
    },
    "no-meta": {}, // a layout without matchup metadata
  };

  it("matches on the disposition pair and deployment, order-independently", () => {
    expect(
      resolveTerrainLayout(meta, "Disruption", "Take and Hold", "sweeping_engagement"),
    ).toBe("take-and-hold-vs-disruption-1");
  });

  it("normalizes the deployment hyphen/underscore", () => {
    expect(
      resolveTerrainLayout(meta, "Take and Hold", "Disruption", "sweeping-engagement"),
    ).toBe("take-and-hold-vs-disruption-1");
  });

  it("returns undefined when nothing matches", () => {
    expect(
      resolveTerrainLayout(meta, "Take and Hold", "Disruption", "dawn_of_war"),
    ).toBeUndefined();
    expect(
      resolveTerrainLayout(meta, "Take and Hold", "Take and Hold", "tipping_point"),
    ).toBeUndefined();
  });

  it("every resolved layout against gwTerrain has matching metadata", () => {
    const ds = dispositions(eventMatrix);
    for (const a of ds) {
      for (const b of ds) {
        for (const layout of ["A", "B", "C"] as Layout[]) {
          const deployment = resolveMission(eventMatrix, a, b, layout);
          const id = resolveTerrainLayout(gwTerrain.layout, a, b, deployment);
          if (id === undefined) continue; // not every cell is covered upstream
          const entry = gwTerrain.layout[id];
          expect([...(entry.dispositions ?? [])].sort()).toEqual(
            [a, b].sort(),
          );
          expect(entry.deployment_pattern_id?.replace(/-/g, "_")).toBe(
            deployment,
          );
        }
      }
    }
  });
});
