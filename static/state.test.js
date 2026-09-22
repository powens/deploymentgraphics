import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY, STORAGE_VERSION, loadState, saveState } from "./state.js";

/**
 * Uses a stubbed store in the node environment rather than happy-dom: Node's
 * own `localStorage` global (undefined without `--localstorage-file`) shadows
 * happy-dom's, but it is a configurable accessor, so a stub can replace it.
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
