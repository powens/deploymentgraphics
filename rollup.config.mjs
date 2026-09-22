import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";

// No declarations: dist/ is uploaded wholesale as the demo site.
const tsPlugin = () =>
  typescript({ tsconfig: "./tsconfig.json", declaration: false });
const isWatch = process.env.ROLLUP_WATCH === "true";

export default [
  {
    // The demo app's entry (not the package's): renderer, presets, viewer
    // controls and js-yaml for static/app.js.
    input: "src/bundle.ts",
    output: { file: "dist/bundle.js", format: "es" },
    treeshake: false,
    plugins: [
      tsPlugin(),
      // For `js-yaml`, the only bare import; it ships ESM, so no commonjs plugin.
      nodeResolve(),
      ...(isWatch
        ? // static first, so a stale `make build-gh-pages` copy in dist/
          // can't shadow edits; dist supplies bundle.js.
          [serve({ contentBase: ["static", "dist"], open: true }), autoReload()]
        : []),
    ],
  },
];
