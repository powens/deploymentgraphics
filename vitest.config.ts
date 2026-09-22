import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `make build-gh-pages` copies static/ (and its tests) into dist/.
    exclude: [...defaultExclude, "dist/**", "lib/**"],
  },
});
