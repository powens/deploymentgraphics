// localStorage persistence for the viewer. The blob is opaque here apart from
// its version; controls are validated by `src/viewer-controls.ts`.
//
// Persisted shape:
//   { version, mode: "controls" | "yaml", controls: Controls, yaml: string | null }

export const STORAGE_KEY = "deploymentgraphics:state";

// Bump whenever the control set changes (pinned in
// `src/viewer-controls.test.ts`); saved state with another version is dropped.
export const STORAGE_VERSION = 2;

// Best-effort persistence: localStorage may be disabled or full.
export function saveState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, ...state }),
    );
  } catch {
    // Ignore: persistence is a convenience.
  }
}

// Returns the parsed state, or null when absent, unreadable, or stale.
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STORAGE_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
