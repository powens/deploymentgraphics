import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as bundle from "./bundle.js";

/**
 * The demo's contract with its entry point. `static/app.js` is not
 * type-checked or linted, so a mismatch between its imports and `bundle.ts`'s
 * exports would otherwise only show up as the page failing at load. It is read
 * as text because importing it runs it against `document`.
 */
const appSource = readFileSync(
  fileURLToPath(new URL("../static/app.js", import.meta.url)),
  "utf8",
);

/** Read as text: importing it would pull in rollup's plugins, and it is outside `rootDir`. */
const rollupConfigSource = readFileSync(
  fileURLToPath(new URL("../rollup.config.mjs", import.meta.url)),
  "utf8",
);

/** The names `static/app.js` imports from `./bundle.js`. */
function importedFromBundle(source: string): string[] {
  const block = /import\s*\{([^}]*)\}\s*from\s*["']\.\/bundle\.js["']/.exec(source);
  if (!block) throw new Error("static/app.js has no import from ./bundle.js");
  return block[1]
    .split(",")
    .map((name) => name.trim().split(/\s+as\s+/)[0])
    .filter(Boolean);
}

describe("the demo bundle entry", () => {
  it("is what rollup builds dist/bundle.js from", () => {
    // The checks below are only meaningful if rollup builds from this module.
    expect(rollupConfigSource).toMatch(/input:\s*["']src\/bundle\.ts["']/);
  });

  it("exports everything static/app.js imports", () => {
    const imported = importedFromBundle(appSource).sort();
    // Exact match: an export `app.js` does not import is dead weight.
    expect(Object.keys(bundle).sort()).toEqual(imported);
  });

  it("leaves static/app.js no runtime data fetch", () => {
    // All config data is bundled via `src/presets/`; fetching the YAML at
    // runtime would ship it twice and put a parse on the render path.
    expect(appSource).not.toMatch(/\bfetch\s*\(/);
  });

  it("stays narrower than a barrel", () => {
    // `bundle.ts` may reach past the published API for the demo's needs, but
    // not re-export renderer internals wholesale.
    for (const name of [
      "renderMissionCardToString",
      "resolveLayout",
      "placedTransform",
      "makeBuildings",
      "serializeSvg",
      "virtualSvgDocument",
      "baseTheme",
    ]) {
      expect(bundle).not.toHaveProperty(name);
    }
  });
});
