import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import typescript from "@rollup/plugin-typescript";

const tsPlugin = () => typescript({ tsconfig: "./tsconfig.json" });
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
