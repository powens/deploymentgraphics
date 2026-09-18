import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { type TerrainConfig } from "./terrain-config";
import { resolvePlacement } from "./placement";
import { features } from "./features";

// Canvas size taken from static/data/base.yml (`size:`).
const CANVAS = { width: 60, height: 44 };
const terrainUrl = (file: string) =>
  fileURLToPath(new URL(`../static/data/terrain/${file}`, import.meta.url));
const loadTerrainYaml = (file: string) =>
  yaml.load(readFileSync(terrainUrl(file), "utf8")) as Partial<TerrainConfig>;

describe("combined.yml", () => {
  // combined.yml carries layouts only; templates live in templates-simple.yml.
  // Merge them as gen-presets does to get a complete TerrainConfig.
  const terrain = {
    ...loadTerrainYaml("templates-simple.yml"),
    ...loadTerrainYaml("combined.yml"),
  } as TerrainConfig;

  it("every building in every layout resolves without throwing", () => {
    for (const [name, layout] of Object.entries(terrain.layout)) {
      for (const placement of layout.templates) {
        expect(
          () => resolvePlacement(placement, terrain.templates, CANVAS),
          `layout ${name}, building type ${placement.type}`,
        ).not.toThrow();
      }
    }
  });

  it("every feature has a draw function", () => {
    for (const [name, layout] of Object.entries(terrain.layout)) {
      for (const f of layout.features ?? []) {
        expect(features, `layout ${name}`).toHaveProperty([f.type]);
      }
    }
  });
});
