import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import copy from "rollup-plugin-copy";

export default {
  input: "src/make-mission-card.js",
  output: {
    file: "dist/bundle.js",
    format: "iife",
    name: "missionCard",
  },
  treeshake: false,

  plugins: [
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
