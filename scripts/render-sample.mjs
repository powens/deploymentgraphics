// Renders sample mission cards to assets/*.svg for the README.
// Throwaway tooling — run after `pnpm build:lib`.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderMissionCardToString } from "../lib/index.js";
import {
  baseTheme,
  buildConfig,
  gwTemplatesReal,
  gwTerrain,
  missions,
} from "../lib/presets/index.js";

const outDir = fileURLToPath(new URL("../assets/", import.meta.url));
mkdirSync(outDir, { recursive: true });

// The README sample shows the detailed GW footprints. buildConfig defaults to
// empty terrain and gwTerrain carries the plain rectangles, so pass the swap
// explicitly.
const samples = [
  {
    file: "sample.svg",
    opts: {
      mission: missions.search_and_destroy,
      layout: "bm-take-vs-take-03",
      grid: true,
      terrain: { ...gwTerrain, ...gwTemplatesReal },
    },
  },
];

// px per board inch, so GitHub shows the card at a sensible size (the markup
// itself only carries a viewBox).
const SCALE = 15;

for (const { file, opts } of samples) {
  const config = buildConfig(opts);
  const { width, height } = config.base.size;
  const svg = renderMissionCardToString(config, baseTheme, {
    width: width * SCALE,
    height: height * SCALE,
  });
  writeFileSync(outDir + file, svg + "\n");
  console.log(`wrote assets/${file}`);
}
