import { describe, expect, it } from "vitest";
import {
  buildConfig,
  renderMissionCardToString,
  resolveMission,
  resolveTerrainLayout,
} from "./index.js";
import { eventMatrix, gwTerrain, gwTerrainIndex, missions } from "./presets/index.js";

/**
 * The README's examples, verbatim but for the import specifiers. `pnpm
 * type-check` compiles this file under `strict`, so an example that stops
 * type-checking fails CI's type-check rather than a reader's build.
 */
describe("README: resolving a matchup", () => {
  it("indexes `missions` with what resolveMission returns", () => {
    const deployment = resolveMission(eventMatrix, "Purge the Foe", "Reconnaissance", "A");
    const layout = resolveTerrainLayout(gwTerrainIndex, "Purge the Foe", "Reconnaissance", deployment);
    const svg = renderMissionCardToString(
      buildConfig({ mission: missions[deployment], terrain: gwTerrain, layout }),
    );
    expect(svg).toContain(`Deployment map: ${missions[deployment].name}`);
  });
});
