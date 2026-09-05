import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Vitest 4 excludes only node_modules and .git by default, and the demo's
    // tests live in `static/`, which `make build-gh-pages` copies wholesale
    // into `dist/`. Without this a stale build runs each of them a second time
    // from its copy.
    exclude: [...defaultExclude, "dist/**", "lib/**"],
  },
});
