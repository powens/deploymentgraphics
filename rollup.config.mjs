import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import typescript from "@rollup/plugin-typescript";

// `declaration: false` overrides tsconfig.json, which turns declarations on for
// the editor and for `pnpm run build:lib`. The demo build's outDir is dist/, and
// make-gh-pages.yml uploads that directory wholesale — so leaving it on scatters
// a .d.ts for every compiled module (tests included) across the published site.
const tsPlugin = () =>
  typescript({ tsconfig: "./tsconfig.json", declaration: false });
const isWatch = process.env.ROLLUP_WATCH === "true";

export default [
  {
    // bundle.ts is the demo app's entry, separate from the package's public
    // entry (index.ts). It re-exports the renderer plus the generated presets
    // (missions, gwTerrain) that static/app.js drives its dropdowns from, so
    // the mission/layout lists still live in one place (the YAML-generated
    // presets) — plus mergeTerrain and the event matrix, which the app needs
    // and the package deliberately does not publish.
    input: "src/bundle.ts",
    output: { file: "dist/bundle.js", format: "es" },
    treeshake: false,
    plugins: [
      tsPlugin(),
      ...(isWatch
        ? // Serve live sources first so a prior `make build-gh-pages` copy of
          // static/* into dist/ can't shadow edits during dev. dist still
          // provides the built bundle.js (absent from static).
          [serve({ contentBase: ["static", "dist"], open: true }), autoReload()]
        : []),
    ],
  },
];
