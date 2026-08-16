// Renders sample mission cards to assets/*.svg for the README.
// Throwaway tooling — run after `pnpm build:lib`.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderMissionCardToString } from "../lib/index.js";
import { baseTheme, buildConfig, missions } from "../lib/presets/index.js";

const outDir = fileURLToPath(new URL("../assets/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const samples = [
  {
    file: "sample.svg",
    opts: {
      mission: missions.search_and_destroy,
      layout: "take-and-hold-mirror-3",
      grid: true,
    },
  },
];

// The board is measured in inches; render at 15px/inch so GitHub shows the
// card at a sensible size (the markup itself only carries a viewBox).
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
