// Packs the library and checks the tarball works for a real consumer.
//
// `pnpm test` exercises src/; this exercises what npm would ship: the `files`
// list, the `exports` map and the emitted `.d.ts`. Installs the tarball into a
// throwaway `type: module` package, renders a mission card through both entry
// points under plain Node, then type-checks a consumer `.ts` against the packed
// declarations with `moduleResolution: nodenext`.
//
// Run after `pnpm build:lib`; packs with scripts off so it tests that `lib/`.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tsc = join(root, "node_modules/typescript/bin/tsc");

if (!existsSync(join(root, "lib/index.js"))) {
  console.error("lib/ is missing; run `pnpm build:lib` first.");
  process.exit(1);
}

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
}

const work = mkdtempSync(join(tmpdir(), "deploymentgraphics-pack-"));
try {
  run("pnpm", ["pack", "--pack-destination", work, "--config.ignore-scripts=true"], root);
  const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error(`no tarball in ${work}`);

  const consumer = join(work, "consumer");
  run("mkdir", [consumer], work);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--ignore-scripts", join(work, tarball)],
    consumer,
  );

  // Both entry points, under plain Node: no bundler, no TS loader.
  writeFileSync(
    join(consumer, "smoke.mjs"),
    `import { renderMissionCardToString } from "deploymentgraphics";
import { buildConfig, missions } from "deploymentgraphics/presets";

const svg = renderMissionCardToString(buildConfig({ mission: missions.search_and_destroy }));
if (typeof svg !== "string" || !svg.startsWith("<svg")) {
  throw new Error("expected an <svg string, got: " + String(svg).slice(0, 80));
}
console.log("rendered " + svg.length + " chars of SVG");
`,
  );
  run("node", ["smoke.mjs"], consumer);

  // The public types mention SVGElement, so a consumer needs lib DOM.
  writeFileSync(
    join(consumer, "smoke.ts"),
    `import { renderMissionCardToString, type FullConfig } from "deploymentgraphics";
import { buildConfig, missions, type MissionId } from "deploymentgraphics/presets";

const id: MissionId = "search_and_destroy";
const config: FullConfig = buildConfig({ mission: missions[id] });
const svg: string = renderMissionCardToString(config);
export { svg };
`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "es2022",
        lib: ["es2022", "dom"],
        types: [],
        strict: true,
        noEmit: true,
      },
      files: ["smoke.ts"],
    }),
  );
  run("node", [tsc, "-p", "tsconfig.json"], consumer);
  console.log("consumer type-check passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
