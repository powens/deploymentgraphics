import { describe, expect, it } from "vitest";
import {
  type Layout,
  dispositions,
  eventMatrixKey,
  resolveMission,
} from "./event-matrix.js";
import { eventMatrix } from "./presets/event-matrix.js";
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
