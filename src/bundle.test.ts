import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as bundle from "./bundle.js";

/**
 * The browser demo's contract with its entry point.
 *
 * `static/app.js` is plain JS outside `src/`: it is not type-checked, eslint
 * does not resolve it, and no test imports it. So nothing connected `app.js`'s
 * import list to what `bundle.ts` exports — trimming an export here, or adding
 * an import there, left `pnpm build`, `pnpm lint`, `pnpm type-check` and the
 * whole suite green while the demo page died at load with "does not provide an
 * export named …". `index.ts` used to be the rollup entry and was covered by
 * `index.test.ts`; narrowing the published interface moved the demo onto this
 * module and took that cover away.
 *
 * Reading the source rather than importing it is the point: `app.js` is a
 * browser module that runs on load and touches `document`.
 */
const appSource = readFileSync(
  fileURLToPath(new URL("../static/app.js", import.meta.url)),
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
  it("exports everything static/app.js imports", () => {
    const imported = importedFromBundle(appSource).sort();
    // Not a subset check: the demo entry exists only to serve `app.js`, so an
    // export nothing imports is dead weight that widened the entry for free.
    expect(Object.keys(bundle).sort()).toEqual(imported);
  });

  it("stays narrower than a barrel", () => {
    // `bundle.ts` deliberately reaches past the published interface — the demo
    // merges terrain files at fetch time and drives dropdowns from the event
    // matrix. That licence is for those pieces, not for re-exporting the
    // renderer's internals wholesale.
    for (const name of [
      "renderMissionCardToString",
      "resolveLayout",
      "placedTransform",
      "makeBuildings",
      "serializeSvg",
      "virtualSvgDocument",
      "baseTheme",
      "baseConfig",
    ]) {
      expect(bundle).not.toHaveProperty(name);
    }
  });
});
