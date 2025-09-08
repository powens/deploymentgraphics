import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import copy from "rollup-plugin-copy";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/mission-card.ts", // Changed to .ts
  output: {
    file: "dist/bundle.js",
    format: "iife",
    name: "missionCard",
  },
  treeshake: false,

  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
    }),
    copy({
      targets: [
        // { src: "static/index.html", dest: "dist/index.html" },
        // { src: "static/data", dest: "dist/data" },
      ],
    }),
    serve({ contentBase: ["dist", "static", "samples"], open: true }),
    autoReload(),
  ],
};
