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
 * cannot recover the precise {@link Controls} field types — that last step stays
 * a cast, and `viewer-controls.test.ts` pins the defaults. The *key set* does
 * not: {@link SpecValues} is checked against this type, so the spec covering
 * every {@link ControlKey} is a compile-time guarantee rather than a test's.
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

// Layout variants within a disposition pairing. Keyed by `Layout` so the list
// and the union cannot drift apart in *either* direction: dropping a variant
// from the union leaves an excess key here, and adding one leaves the `Record`
// incomplete. A bare `readonly Layout[]` annotation only catches the first,
// and the second is the quiet one — a new variant missing from the dropdown
// and sanitized out of its own URLs, with nothing failing to say so.
const LAYOUT_IDS = Object.keys({
  A: null,
  B: null,
  C: null,
} satisfies Record<Layout, null>) as readonly Layout[];

// Building-template set: the illustrative shapes or the detailed GW footprints.
// Each value is the `templates-<value>.yml` filename stem, so renaming or
// dropping one of those files leaves a dropdown entry that 404s at render
// time — nothing here can see the `static/data/terrain/` directory.
const TEMPLATE_SETS = ["simple", "real"];

// Canvas rotation in degrees, as strings (the `<select>` values).
const ROTATIONS = ["0", "90", "-90"];

// The rows themselves, kept as a literal tuple so each `key` survives as its
// own literal type. `controlSpec` below re-exports them under the wider
// `readonly ControlRow[]`, which is what every caller wants but which also
// widens every `key` back to the whole union — erasing exactly the information
// `SpecKey` needs.
const controlRows = [
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
] as const satisfies readonly ControlRow[];

/**
 * The nine controls, in URL-param order.
 *
 * Every allowlist that *has* a referent in this repo derives from it — the
 * generated presets or a type — so options, validation and the underlying
 * YAML cannot drift apart. `TEMPLATE_SETS` and `ROTATIONS` are the two
 * literals: the first names files this module cannot see, the second has no
 * referent to drift from.
 */
export const controlSpec: readonly ControlRow[] = controlRows;

/** The keys {@link controlRows} actually carries a row for. */
type SpecKey = (typeof controlRows)[number]["key"];

/**
 * The spec's own value record — the same shape as {@link ControlValues}, but
 * built from the keys the spec *has* rather than the keys it is supposed to
 * have, so the two can be compared. Every `satisfies ControlValues` below is
 * that comparison.
 */
type SpecValues = Record<SpecKey, string | boolean>;

// `satisfies ControlValues` is the load-bearing half: it fails the moment a key
// joins `ControlKey` without a matching spec row. That is the quiet direction —
// the `satisfies readonly ControlRow[]` above already rejects a row naming a key
// the union does not have, but nothing rejected the reverse, and the two casts
// here would hand back an object missing that field while typed as having it.
const DEFAULTS = Object.fromEntries(
  controlRows.map((row) => [row.key, row.default]),
) as SpecValues satisfies ControlValues as Controls;

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
  const out: Partial<SpecValues> = {};
  // `controlSpec`, not `controlRows`: the widened rows are what the allowlist
  // membership test wants — the literal tuple types `lay`'s `allowed` as
  // `readonly Layout[]`, which no plain string can be tested against.
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
  return out as SpecValues satisfies ControlValues as Controls;
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
 * A flag's URL form. `"1"` and `"0"` are the only spellings
 * {@link controlsToSearch} writes; anything else — a hand-written
 * `?territory=true`, a param left empty — takes the row's default rather than
 * reading as off, so such a link still shows what it always showed.
 */
function checkboxFromParam(value: string, fallback: boolean): boolean {
  if (value === "1") {
    return true;
  }
  if (value === "0") {
    return false;
  }
  return fallback;
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
    raw[row.key] =
      row.kind === "checkbox" ? checkboxFromParam(value, row.default) : value;
  }
  return sanitizeControls(raw);
}

/**
 * True when the query string explicitly carries any control — the test that
 * makes a URL a shared link rather than a bare page load. Private: the only
 * thing that turns on the answer is {@link initialControls}'s precedence rule,
 * and a caller asking the question separately could only get that rule wrong.
 */
function searchHasControls(search: string): boolean {
  const params = new URLSearchParams(search);
  return controlSpec.some((row) => params.has(row.key));
}

/** What a page load should come up showing, and whether to persist it. */
export interface InitialControls {
  /** The controls to write into the DOM. */
  readonly controls: Controls;
  /** Which editor drives the render. */
  readonly mode: "controls" | "yaml";
  /**
   * Text for the YAML editor, or null to leave the editor as the markup has
   * it. Non-null exactly when `mode` is `"yaml"`.
   */
  readonly yaml: string | null;
  /**
   * Whether this state should be written back to storage on load.
   *
   * False for a URL-driven load: following someone's link must not overwrite
   * the visitor's own saved session. Their later edits persist as usual.
   */
  readonly persist: boolean;
}

/**
 * Resolves a page load's starting state from the only two places one can come
 * from: the query string, and whatever storage handed back.
 *
 * Two rules live here, and they are why this is a function rather than a
 * branch in the app's `start()`:
 *
 * 1. **An explicit URL wins.** A query string carrying any control is a shared
 *    link, and it beats saved state outright — including a saved YAML
 *    override, which a URL cannot express.
 * 2. **A URL-driven load is read-only for storage.** See `persist`.
 *
 * `saved` is untrusted — any shape, including null — so every field is either
 * validated here or run through {@link sanitizeControls}.
 */
export function initialControls({
  search,
  saved,
}: {
  search: string;
  saved: unknown;
}): InitialControls {
  if (searchHasControls(search)) {
    return {
      controls: controlsFromSearch(search),
      mode: "controls",
      yaml: null,
      persist: false,
    };
  }
  if (saved === null || typeof saved !== "object") {
    return {
      controls: defaultControls(),
      mode: "controls",
      yaml: null,
      persist: true,
    };
  }
  const blob = saved as { controls?: unknown; mode?: unknown; yaml?: unknown };
  // The saved mode counts only when there is a string to put in the editor: a
  // blob whose `yaml` is missing or null comes up in controls mode rather than
  // in a yaml mode with nothing to render.
  const yaml =
    blob.mode === "yaml" && typeof blob.yaml === "string" ? blob.yaml : null;
  return {
    controls: sanitizeControls(blob.controls),
    mode: yaml === null ? "controls" : "yaml",
    yaml,
    persist: true,
  };
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
 *
 * Exported because the app binds its own references the same way — a bare
 * `getElementById` there would hand back `null` and fail somewhere later,
 * with a blank page and no mention of which control drifted.
 *
 * @throws if the root has no element with the row's id.
 */
export function controlElement(
  root: ControlsRoot,
  row: ControlRow,
): HTMLElement {
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
