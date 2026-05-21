import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import copy from "rollup-plugin-copy";
import typescript from "@rollup/plugin-typescript";

const tsPlugin = () => typescript({ tsconfig: "./tsconfig.json" });

export default [
  {
    input: "src/main.ts",
    output: { file: "dist/bundle.js", format: "es" },
    treeshake: false,
    plugins: [
      tsPlugin(),
      copy({ targets: [] }),
      serve({ contentBase: ["dist", "static", "samples"], open: true }),
      autoReload(),
    ],
  },
  {
    input: "src/editor.ts",
    output: { file: "dist/editor.bundle.js", format: "es" },
    treeshake: false,
    plugins: [tsPlugin()],
  },
];
