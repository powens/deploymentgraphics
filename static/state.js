// Persistence for the editor: URL query params and localStorage.
//
// Persisted shape:
//   { version, mode: "controls" | "yaml",
//     controls: { m, t, tpl, grid, rot }, yaml: string | null }

const STORAGE_KEY = "deploymentgraphics:state";
const STORAGE_VERSION = 1;

// Canvas rotation in degrees, as strings (the <select> values).
export const ROTATIONS = ["0", "90", "-90"];

// Building-template set: the illustrative shapes or the detailed GW footprints.
// Each value is the templates-<value>.yml filename stem.
export const TEMPLATE_SETS = ["simple", "real"];

export const DEFAULT_CONTROLS = {
  m: "dawn_of_war",
  t: "1",
  tpl: "simple",
  grid: false,
  rot: "0",
};

// Coerce an untrusted controls object to a valid one, falling back to
// defaults for any unknown mission/terrain id or non-boolean flag.
export function sanitizeControls(controls, missionIds, terrainIds) {
  const c = controls ?? {};
  return {
    m: missionIds.includes(c.m) ? c.m : DEFAULT_CONTROLS.m,
    t: terrainIds.includes(c.t) ? c.t : DEFAULT_CONTROLS.t,
    tpl: TEMPLATE_SETS.includes(c.tpl) ? c.tpl : DEFAULT_CONTROLS.tpl,
    grid: c.grid === true,
    rot: ROTATIONS.includes(String(c.rot)) ? String(c.rot) : DEFAULT_CONTROLS.rot,
  };
}

// True when the URL explicitly carries any control param. An explicit URL
// (a shared link) takes precedence over saved localStorage state.
export function urlHasControls() {
  const params = new URLSearchParams(window.location.search);
  return ["m", "t", "tpl", "grid", "rot"].some((key) => params.has(key));
}

export function readControlsFromUrl(missionIds, terrainIds) {
  const params = new URLSearchParams(window.location.search);
  return sanitizeControls(
    {
      m: params.get("m"),
      t: params.get("t"),
      tpl: params.get("tpl"),
      grid: params.get("grid") === "1",
      rot: params.get("rot"),
    },
    missionIds,
    terrainIds,
  );
}

// Write only non-default params, so a default-state link stays clean.
// readControlsFromUrl restores any absent param to its default.
export function writeControlsToUrl(controls) {
  const params = new URLSearchParams();
  if (controls.m !== DEFAULT_CONTROLS.m) {
    params.set("m", controls.m);
  }
  if (controls.t !== DEFAULT_CONTROLS.t) {
    params.set("t", controls.t);
  }
  if (controls.tpl !== DEFAULT_CONTROLS.tpl) {
    params.set("tpl", controls.tpl);
  }
  if (controls.grid) {
    params.set("grid", "1");
  }
  if (controls.rot !== DEFAULT_CONTROLS.rot) {
    params.set("rot", controls.rot);
  }
  const query = params.toString();
  const url = query ? `?${query}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

// Clear the query string entirely. Used in yaml mode, where the URL cannot
// represent the override.
export function clearUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

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
