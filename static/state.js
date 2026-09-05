// Persistence for the viewer app: the localStorage half of it. The URL half,
// and the shape of the controls themselves, belong to `src/viewer-controls.ts`
// (reached through `bundle.js`) — this module takes an opaque blob and hands it
// back, and knows only how to tell a stale one from a current one.
//
// Persisted shape:
//   { version, mode: "controls" | "yaml", controls: Controls, yaml: string | null }

export const STORAGE_KEY = "deploymentgraphics:state";

// Bumped to 2 when the controls switched from a direct mission (`m`) to
// disposition/layout (`da`/`db`/`lay`); older saved state is dropped. Bump it
// again whenever the control set changes — `src/viewer-controls.test.ts` pins
// that set, so a change there fails loudly and points here.
export const STORAGE_VERSION = 2;

// Best-effort persistence: localStorage may be disabled or full.
export function saveState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, ...state }),
    );
  } catch {
    // Ignore — persistence is a convenience, not a requirement.
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
