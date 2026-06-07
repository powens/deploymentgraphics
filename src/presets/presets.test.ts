import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { baseConfig } from "./base.js";
import { missions } from "./missions.js";
import { gwTerrain } from "./terrain.js";
import { baseTheme } from "./theme.js";

// The presets are generated from the YAML the browser app loads (see
// scripts/gen-presets.mjs). These tests confirm the generated modules
// still deep-equal their YAML source — a correctness check on the
// generator, complementing CI's `gen:presets:check` staleness check.
const dataDir = fileURLToPath(new URL("../../static/data/", import.meta.url));
const loadYaml = (relPath: string): unknown =>
  yaml.load(readFileSync(dataDir + relPath, "utf8"));

describe("presets match the YAML source", () => {
  it("baseConfig matches base.yml", () => {
    expect(baseConfig).toEqual(loadYaml("base.yml"));
  });

  it("gwTerrain matches terrain/gw.yml", () => {
    expect(gwTerrain).toEqual(loadYaml("terrain/gw.yml"));
  });

  it.each(Object.keys(missions))("mission %s matches its YAML", (id) => {
    expect(missions[id as keyof typeof missions]).toEqual(
      loadYaml(`deployment/${id}.yml`),
    );
  });

  it("baseTheme matches theme.yml", () => {
    expect(baseTheme).toEqual(loadYaml("theme.yml"));
  });
});
