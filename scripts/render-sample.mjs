// Renders sample mission cards to assets/*.svg for the README.
// Throwaway tooling — run after `pnpm build:lib`.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const window = new Window();
globalThis.document = window.document;

const { makeMissionCard } = await import("../lib/index.js");
const { buildConfig, missions } = await import("../lib/presets/index.js");

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

// Board is 60×44 inches; render at 15px/inch so GitHub shows it at a
// sensible size (the SVG itself only carries a viewBox).
const SCALE = 15;

for (const { file, opts } of samples) {
  const svg = makeMissionCard(buildConfig(opts));
  // outerHTML serializes as HTML, which omits the namespace the DOM carries
  // implicitly. A standalone .svg is parsed as XML, so without an explicit
  // xmlns every element lands in the null namespace and nothing renders —
  // that's what breaks the image embedded in the README on GitHub.
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(60 * SCALE));
  svg.setAttribute("height", String(44 * SCALE));
  writeFileSync(outDir + file, svg.outerHTML + "\n");
  console.log(`wrote assets/${file}`);
}
