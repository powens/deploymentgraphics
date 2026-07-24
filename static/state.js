// Persistence for the viewer app: URL query params and localStorage.
//
// Persisted shape:
//   { version, mode: "controls" | "yaml",
//     controls: { da, db, lay, m, t, tpl, grid, territory, rot },
//     yaml: string | null }
//
// `da`/`db` are the two force dispositions and `lay` the layout (A/B/C);
// changing any of them sets the deployment `m` via the event matrix, but `m`
// is also a control in its own right and can be overridden directly (see
// app.js). It is persisted so a manual override survives a reload.

const STORAGE_KEY = "deploymentgraphics:state";
// Bumped to 2 when the controls switched from a direct mission (`m`) to
// disposition/layout (`da`/`db`/`lay`); older saved state is dropped.
const STORAGE_VERSION = 2;

// Canvas rotation in degrees, as strings (the <select> values).
export const ROTATIONS = ["0", "90", "-90"];

// Building-template set: the illustrative shapes or the detailed GW footprints.
// Each value is the templates-<value>.yml filename stem.
export const TEMPLATE_SETS = ["simple", "real"];

// Layout variants within a disposition pairing.
export const LAYOUTS = ["A", "B", "C"];

export const DEFAULT_CONTROLS = {
  // Take and Hold vs Take and Hold, layout B -> dawn_of_war (the previous
  // default mission), so the initial render is unchanged.
  da: "Take and Hold",
  db: "Take and Hold",
  lay: "B",
  m: "dawn_of_war",
  t: "1",
  // Default to the detailed GW footprints; the illustrative "simple" set is opt-in.
  tpl: "real",
  grid: false,
  // The territory (halfway divider) line draws by default; the toggle opts out.
  territory: true,
  rot: "0",
};

// Coerce an untrusted controls object to a valid one, falling back to
// defaults for any unknown disposition/layout/mission/terrain id or non-boolean
// flag.
export function sanitizeControls(controls, dispositionIds, missionIds, terrainIds) {
  const c = controls ?? {};
  return {
    da: dispositionIds.includes(c.da) ? c.da : DEFAULT_CONTROLS.da,
    db: dispositionIds.includes(c.db) ? c.db : DEFAULT_CONTROLS.db,
    lay: LAYOUTS.includes(c.lay) ? c.lay : DEFAULT_CONTROLS.lay,
    m: missionIds.includes(c.m) ? c.m : DEFAULT_CONTROLS.m,
    t: terrainIds.includes(c.t) ? c.t : DEFAULT_CONTROLS.t,
    tpl: TEMPLATE_SETS.includes(c.tpl) ? c.tpl : DEFAULT_CONTROLS.tpl,
    grid: c.grid === true,
    territory: c.territory !== false,
    rot: ROTATIONS.includes(String(c.rot)) ? String(c.rot) : DEFAULT_CONTROLS.rot,
  };
}

// True when the URL explicitly carries any control param. An explicit URL
// (a shared link) takes precedence over saved localStorage state.
export function urlHasControls() {
  const params = new URLSearchParams(window.location.search);
  return ["da", "db", "lay", "m", "t", "tpl", "grid", "territory", "rot"].some((key) =>
    params.has(key),
  );
}

export function readControlsFromUrl(dispositionIds, missionIds, terrainIds) {
  const params = new URLSearchParams(window.location.search);
  return sanitizeControls(
    {
      da: params.get("da"),
      db: params.get("db"),
      lay: params.get("lay"),
      m: params.get("m"),
      t: params.get("t"),
      tpl: params.get("tpl"),
      grid: params.get("grid") === "1",
      // Defaults on; an explicit territory=0 opts out.
      territory: params.get("territory") !== "0",
      rot: params.get("rot"),
    },
    dispositionIds,
    missionIds,
    terrainIds,
  );
}

// Write only non-default params, so a default-state link stays clean.
// readControlsFromUrl restores any absent param to its default.
export function writeControlsToUrl(controls) {
  const params = new URLSearchParams();
  if (controls.da !== DEFAULT_CONTROLS.da) {
    params.set("da", controls.da);
  }
  if (controls.db !== DEFAULT_CONTROLS.db) {
    params.set("db", controls.db);
  }
  if (controls.lay !== DEFAULT_CONTROLS.lay) {
    params.set("lay", controls.lay);
  }
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
  if (!controls.territory) {
    params.set("territory", "0");
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
