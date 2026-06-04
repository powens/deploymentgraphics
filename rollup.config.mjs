import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import copy from "rollup-plugin-copy";
import typescript from "@rollup/plugin-typescript";

const tsPlugin = () => typescript({ tsconfig: "./tsconfig.json" });
const isWatch = process.env.ROLLUP_WATCH === "true";

export default [
  {
    // index.ts is the package's public entry: it re-exports the renderer plus
    // the generated presets (missions, gwTerrain), which static/app.js needs
    // for its dropdowns. Keeping the web bundle on index.ts is what lets the
    // mission/layout lists live in one place (the YAML-generated presets).
    input: "src/index.ts",
    output: { file: "dist/bundle.js", format: "es" },
    treeshake: false,
    plugins: [
      tsPlugin(),
      copy({ targets: [] }),
      ...(isWatch
        ? [serve({ contentBase: ["dist", "static", "samples"], open: true }), autoReload()]
        : []),
    ],
  },
  {
    input: "src/editor.ts",
    output: { file: "dist/editor.bundle.js", format: "es" },
    treeshake: false,
    plugins: [tsPlugin()],
  },
];
