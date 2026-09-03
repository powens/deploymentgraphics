/**
 * The viewer's **Controls** — the nine fields a visitor picks in the browser
 * demo, and the single spelling of that set.
 *
 * One row per control ({@link controlSpec}); the URL form, the stored form, the
 * DOM form and the coercion of untrusted input are all *derived* from those
 * rows rather than restated. Adding a control is one row.
 *
 * Reached by the demo app through `bundle.ts`, not a published entry point:
 * only this repo's demo has controls. Nothing here reaches for a global: the
 * URL functions take and return a search string, and the DOM functions take
 * their root, so the app keeps the one `location.search` read, the one
 * `history.replaceState` call and the one naming of `document`.
 */
import { dispositions, type Layout } from "./event-matrix.js";
import { eventMatrix } from "./presets/event-matrix.js";
import { missions } from "./presets/missions.js";
import { gwTerrain } from "./presets/terrain.js";

/** A control key: both the URL param name and the {@link Controls} field name. */
export type ControlKey =
  | "da"
  | "db"
  | "lay"
  | "m"
  | "t"
  | "tpl"
  | "grid"
  | "territory"
  | "rot";

/** One visitor's picks. */
export interface Controls {
  /** Force disposition A. */
  da: string;
  /** Force disposition B. */
  db: string;
  /** Layout variant (A/B/C) within the disposition pairing. */
  lay: string;
  /**
   * Deployment (a mission id). Derived from `da`/`db`/`lay` via the event
   * matrix, but a control in its own right: it can be overridden directly, and
   * is persisted so the override survives a reload.
   */
  m: string;
  /** Terrain layout id. */
  t: string;
  /** Building-template set. */
  tpl: string;
  /** Draw the 1×1 grid. */
  grid: boolean;
  /** Draw the territory (halfway divider) line. */
  territory: boolean;
  /** Canvas rotation in degrees, as the `<select>` spells it. */
  rot: string;
}

/**
 * Control values indexed by key. The spec is a heterogeneous array, so a row
 * cannot recover the precise {@link Controls} field types; `viewer-controls.test.ts`
 * pins the key set and the defaults instead.
 */
type ControlValues = Record<ControlKey, string | boolean>;

/** A control backed by a `<select>`. */
interface SelectRow {
  readonly key: ControlKey;
  readonly elementId: string;
  readonly kind: "select";
  readonly default: string;
  /** The accepted values; anything else sanitizes to `default`. */
  readonly allowed: readonly string[];
  /**
   * Set when `index.html` carries the `<option>`s itself. The app populates the
   * rest from `allowed`; `static/index.test.js` holds markup and `allowed` to
   * the same value set.
   */
  readonly staticOptions?: true;
}

/** A control backed by a checkbox. */
interface CheckboxRow {
  readonly key: ControlKey;
  readonly elementId: string;
  readonly kind: "checkbox";
  readonly default: boolean;
}

/** One row of {@link controlSpec}. */
export type ControlRow = SelectRow | CheckboxRow;

// The force dispositions present in the event matrix. Computed once: every
// allowlist below is read on each sanitize.
const DISPOSITION_IDS = dispositions(eventMatrix);

// Layout variants within a disposition pairing. Typed against `Layout` so the
// array and the union cannot drift apart without a compile error.
const LAYOUT_IDS: readonly Layout[] = ["A", "B", "C"];

// Building-template set: the illustrative shapes or the detailed GW footprints.
// Each value is the `templates-<value>.yml` filename stem.
const TEMPLATE_SETS = ["simple", "real"];

// Canvas rotation in degrees, as strings (the `<select>` values).
const ROTATIONS = ["0", "90", "-90"];

/**
 * The nine controls, in URL-param order.
 *
 * Every allowlist derives from the generated presets or from a type in this
 * repo, so options, validation and the underlying YAML cannot drift apart.
 */
export const controlSpec: readonly ControlRow[] = [
  // Take and Hold vs Take and Hold, layout B -> dawn_of_war (the previous
  // default mission), so the initial render is unchanged.
  {
    key: "da",
    elementId: "disposition-a",
    kind: "select",
    default: "Take and Hold",
    allowed: DISPOSITION_IDS,
  },
  {
    key: "db",
    elementId: "disposition-b",
    kind: "select",
    default: "Take and Hold",
    allowed: DISPOSITION_IDS,
  },
  {
    key: "lay",
    elementId: "layout",
    kind: "select",
    default: "B",
    allowed: LAYOUT_IDS,
  },
  {
    key: "m",
    elementId: "deployment",
    kind: "select",
    default: "dawn_of_war",
    allowed: Object.keys(missions),
  },
  {
    key: "t",
    elementId: "terrain",
    kind: "select",
    default: "1",
    allowed: Object.keys(gwTerrain.layout),
  },
  // Default to the detailed GW footprints; the illustrative "simple" set is opt-in.
  {
    key: "tpl",
    elementId: "templates",
    kind: "select",
    default: "real",
    allowed: TEMPLATE_SETS,
    staticOptions: true,
  },
  { key: "grid", elementId: "show-grid", kind: "checkbox", default: false },
  // The territory line draws by default; the toggle opts out.
  {
    key: "territory",
    elementId: "show-territory",
    kind: "checkbox",
    default: true,
  },
  {
    key: "rot",
    elementId: "rotation",
    kind: "select",
    default: "0",
    allowed: ROTATIONS,
    staticOptions: true,
  },
];

const DEFAULTS = Object.fromEntries(
  controlSpec.map((row) => [row.key, row.default]),
) as ControlValues as Controls;

/** The nine defaults, as a fresh object. */
export function defaultControls(): Controls {
  return { ...DEFAULTS };
}

/**
 * Coerces untrusted input — a parsed URL, restored localStorage, anything — to
 * a valid `Controls`. Each field falls back to its default when the key is
 * absent, when a select value is not in the row's allowlist, or when a flag is
 * not a boolean.
 */
export function sanitizeControls(input: unknown): Controls {
  const source = (input ?? {}) as Record<string, unknown>;
  const out: Partial<ControlValues> = {};
  for (const row of controlSpec) {
    const value = source[row.key];
    if (row.kind === "checkbox") {
      out[row.key] = typeof value === "boolean" ? value : row.default;
    } else {
      // `String(value)`: a restored value may be a number (`rot`).
      const text = String(value);
      out[row.key] = row.allowed.includes(text) ? text : row.default;
    }
  }
  return out as ControlValues as Controls;
}

/**
 * The query string for these controls — no leading `?` — holding only the
 * controls that differ from their default, so a default-state link stays clean
 * and {@link controlsFromSearch} restores any absent param.
 *
 * That one rule is also why `grid=1` and `territory=0` are the same case rather
 * than two: the flags differ from opposite defaults.
 */
export function controlsToSearch(controls: Controls): string {
  const values = controls as ControlValues;
  const params = new URLSearchParams();
  for (const row of controlSpec) {
    const value = values[row.key];
    if (value === row.default) {
      continue;
    }
    params.set(
      row.key,
      row.kind === "checkbox" ? (value ? "1" : "0") : String(value),
    );
  }
  return params.toString();
}

/**
 * Reads controls out of a query string, sanitized. An absent param takes its
 * default, which is what makes {@link controlsToSearch}'s omissions round-trip.
 */
export function controlsFromSearch(search: string): Controls {
  const params = new URLSearchParams(search);
  const raw: Record<string, unknown> = {};
  for (const row of controlSpec) {
    const value = params.get(row.key);
    if (value === null) {
      continue;
    }
    raw[row.key] = row.kind === "checkbox" ? value === "1" : value;
  }
  return sanitizeControls(raw);
}

/**
 * True when the query string explicitly carries any control. An explicit URL
 * (a shared link) takes precedence over saved state.
 */
export function searchHasControls(search: string): boolean {
  const params = new URLSearchParams(search);
  return controlSpec.some((row) => params.has(row.key));
}

/**
 * Where the controls live: a document, or any element containing them. Looked
 * up with `querySelector` rather than `getElementById` so a plain container
 * works as a root too, which is what lets the tests build one.
 */
export type ControlsRoot = Document | Element;

/**
 * The element a row is bound to, by id. A missing element is a broken markup
 * contract, not a value to coerce: `static/index.test.js` holds `index.html`
 * to the spec so it fails there rather than in the browser.
 */
function controlElement(root: ControlsRoot, row: ControlRow): HTMLElement {
  const element = root.querySelector<HTMLElement>(`#${row.elementId}`);
  if (element === null) {
    throw new Error(`Control "${row.key}" has no element #${row.elementId}`);
  }
  return element;
}

/**
 * Reads the nine controls out of a DOM subtree, sanitized — the DOM is an
 * input like any other. A `<select>` set to a value it has no `<option>` for
 * reads back as the empty string, so sanitizing is what makes this the
 * inverse of {@link writeControlsToDom} rather than nearly so.
 *
 * Throws if any control's element is absent.
 */
export function readControlsFromDom(root: ControlsRoot): Controls {
  const raw: Record<string, unknown> = {};
  for (const row of controlSpec) {
    const element = controlElement(root, row);
    raw[row.key] =
      row.kind === "checkbox"
        ? (element as HTMLInputElement).checked
        : (element as HTMLSelectElement).value;
  }
  return sanitizeControls(raw);
}

/**
 * Writes the nine controls into a DOM subtree, replacing what is there — every
 * row is assigned, so nothing survives from a previous state.
 *
 * Throws if any control's element is absent.
 */
export function writeControlsToDom(
  root: ControlsRoot,
  controls: Controls,
): void {
  const values = controls as ControlValues;
  for (const row of controlSpec) {
    const element = controlElement(root, row);
    if (row.kind === "checkbox") {
      (element as HTMLInputElement).checked = values[row.key] === true;
    } else {
      (element as HTMLSelectElement).value = String(values[row.key]);
    }
  }
}
