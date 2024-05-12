import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";

export default {
  input: "src/make-mission-card.js",
  output: {
    file: "dist/bundle.js",
    format: "umd",
  },
  treeshake: false,

  plugins: [
    serve({ contentBase: ["dist", "static"], open: true }),
    autoReload(),
  ],
};
