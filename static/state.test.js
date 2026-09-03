import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY, STORAGE_VERSION, loadState, saveState } from "./state.js";

/**
 * Runs in the node environment with a stubbed store rather than under
 * happy-dom: Node ships its own `localStorage` global, which is `undefined`
 * unless the process was started with `--localstorage-file`, and it shadows the
 * one happy-dom would otherwise install. It is a configurable accessor, so a
 * stub can simply take its place.
 */
function installStore(store) {
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
    writable: true,
  });
}

function memoryStore() {
  const entries = new Map();
  return {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => entries.set(key, String(value)),
  };
}

describe("viewer state storage", () => {
  beforeEach(() => {
    installStore(memoryStore());
  });

  it("round-trips a saved blob, stamped with the current version", () => {
    saveState({ mode: "controls", controls: { rot: "90" }, yaml: null });
    expect(loadState()).toEqual({
      version: STORAGE_VERSION,
      mode: "controls",
      controls: { rot: "90" },
      yaml: null,
    });
  });

  it("returns null when nothing is saved", () => {
    expect(loadState()).toBe(null);
  });

  it("drops state saved under an older control set", () => {
    // The version is the only guard against half-restoring a blob whose
    // control set no longer exists, and nothing exercised it until now.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION - 1, mode: "controls" }),
    );
    expect(loadState()).toBe(null);
  });

  it("drops unreadable state rather than throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState()).toBe(null);
  });

  it("drops a blob that parses to a non-object", () => {
    localStorage.setItem(STORAGE_KEY, "null");
    expect(loadState()).toBe(null);
  });

  it("stays quiet when the store itself is unavailable", () => {
    // Persistence is a convenience: a disabled or full localStorage must not
    // take the page down with it.
    installStore({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    expect(() => saveState({ mode: "controls" })).not.toThrow();
    expect(loadState()).toBe(null);
  });
});
