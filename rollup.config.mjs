import serve from "rollup-plugin-serve";
import { autoReload } from "rollup-plugin-auto-reload";
import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";

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
    // (missions, gwTerrain, baseConfig, and — through `viewer-controls.ts` —
    // the detailed footprints behind the `tpl` control) that static/app.js
    // both drives its dropdowns from and renders — so the app ships no YAML
    // and fetches none — plus the event matrix and js-yaml, which the app
    // needs and the package deliberately does not publish.
    input: "src/bundle.ts",
    output: { file: "dist/bundle.js", format: "es" },
    treeshake: false,
    plugins: [
      tsPlugin(),
      // Resolves the one bare specifier in the graph: `js-yaml`, which
      // `bundle.ts` re-exports for the demo's YAML editor tab. It ships an
      // ESM build, so no commonjs plugin is needed. Everything else in the
      // graph is relative, and the package has no runtime dependencies.
      nodeResolve(),
      ...(isWatch
        ? // Serve live sources first so a prior `make build-gh-pages` copy of
          // static/* into dist/ can't shadow edits during dev. dist still
          // provides the built bundle.js (absent from static).
          [serve({ contentBase: ["static", "dist"], open: true }), autoReload()]
        : []),
    ],
  },
];
