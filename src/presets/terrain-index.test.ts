import { describe, expect, it } from "vitest";
import {
  eventMatrixKey,
  resolveMission,
  resolveTerrainLayout,
  dispositions,
  type Layout,
} from "../event-matrix.js";
import { eventMatrix } from "./event-matrix.js";
import { gwTerrain } from "./terrain.js";
import { gwTerrainIndex } from "./terrain-index.js";

/**
 * `gwTerrainIndex` must resolve matchups identically to `gwTerrain.layout`
 * while carrying none of its geometry (~223kB).
 */
describe("gwTerrainIndex", () => {
  const layouts: Layout[] = ["A", "B", "C"];
  const cells = dispositions(eventMatrix).flatMap((a) =>
    dispositions(eventMatrix).flatMap((b) =>
      eventMatrixKey(a, b) in eventMatrix
        ? layouts.map((layout) => ({ a, b, layout }))
        : [],
    ),
  );

  it("covers every matchup cell in the event matrix", () => {
    // Guards the equivalence check below against passing on an empty set.
    expect(cells.length).toBeGreaterThan(40);
  });

  it.each(cells)(
    "resolves $a / $b ($layout) to the same layout as the full corpus",
    ({ a, b, layout }) => {
      const deployment = resolveMission(eventMatrix, a, b, layout);
      expect(resolveTerrainLayout(gwTerrainIndex, a, b, deployment)).toBe(
        resolveTerrainLayout(gwTerrain.layout, a, b, deployment),
      );
    },
  );

  it("holds one entry per bundled layout", () => {
    expect(Object.keys(gwTerrainIndex)).toEqual(Object.keys(gwTerrain.layout));
  });

  it("carries matchup metadata and no geometry", () => {
    for (const [id, meta] of Object.entries(gwTerrainIndex)) {
      expect(Object.keys(meta).sort(), id).toEqual([
        "deployment_pattern_id",
        "dispositions",
      ]);
    }
  });
});
