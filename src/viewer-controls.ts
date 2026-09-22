/**
 * The viewer's **Controls**: the nine fields a visitor picks in the demo.
 * URL, storage and DOM forms are all driven by {@link controlSpec}, so adding
 * a control means adding a row there. Demo-only (reached via `bundle.ts`).
 */
import {
  dispositions,
  resolveMission,
  resolveTerrainLayout,
  type Layout,
} from "./event-matrix.js";
import { eventMatrix } from "./presets/event-matrix.js";
import { missions } from "./presets/missions.js";
import { gwTerrain } from "./presets/terrain.js";
import { gwTemplatesReal } from "./presets/templates-real.js";
import type { TerrainConfig } from "./terrain-config.js";

/** A control key: both the URL param name and the {@link Controls} field name. */
type ControlKey =
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
 * Control values indexed by key. Field types are recovered by cast (the spec
 * is heterogeneous), but key coverage is checked at compile time via
 * {@link SpecValues}.
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
   * Set when `index.html` carries the `<option>`s itself; otherwise the app
   * populates them from `allowed`.
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

const DISPOSITION_IDS = dispositions(eventMatrix);

// Layout variants within a disposition pairing. A `Record<Layout, …>` rather
// than a `Layout[]` so that adding a variant to the union is a type error here
// until it is listed.
const LAYOUT_IDS = Object.keys({
  A: null,
  B: null,
  C: null,
} satisfies Record<Layout, null>) as readonly Layout[];

// Building-template set id -> terrain; the keys are also the dropdown values.
// `gwTerrain` already carries the simple templates, so `gwTemplatesReal` must
// be spread last to override them. Both sets declare the same template box per
// name, so every layout renders against either.
const TEMPLATE_TERRAIN = {
  simple: gwTerrain,
  real: { ...gwTerrain, ...gwTemplatesReal },
} satisfies Record<string, TerrainConfig>;

const TEMPLATE_SETS = Object.keys(TEMPLATE_TERRAIN);

/**
 * The terrain a `tpl` control value names. Throws on an unknown value: input
 * is sanitized upstream, so this is a caller bug, and the render path shows the
 * throw on the stage.
 */
export function terrainForTemplateSet(tpl: string): TerrainConfig {
  const terrain = TEMPLATE_TERRAIN[tpl as keyof typeof TEMPLATE_TERRAIN];
  if (!terrain) throw new Error(`unknown building-template set: ${tpl}`);
  return terrain;
}

const ROTATIONS = ["0", "90", "-90"];

// Kept as a literal tuple so each `key` stays a literal type for `SpecKey`;
// `controlSpec` below is the widened view callers use.
const controlRows = [
  // Take and Hold vs Take and Hold, layout B -> dawn_of_war.
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
    // What the default pairing resolves to, so the first render agrees with
    // the dropdowns. Also the fallback in `deriveControls`.
    default: "bm-take-vs-take-02",
    allowed: Object.keys(gwTerrain.layout),
  },
  {
    key: "tpl",
    elementId: "templates",
    kind: "select",
    default: "real",
    allowed: TEMPLATE_SETS,
    staticOptions: true,
  },
  { key: "grid", elementId: "show-grid", kind: "checkbox", default: false },
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
 * The nine controls, in URL-param order. Allowlists derive from the generated
 * presets or types, so options and validation track the data.
 */
export const controlSpec: readonly ControlRow[] = controlRows;

type SpecKey = (typeof controlRows)[number]["key"];

/**
 * {@link ControlValues} built from the keys the spec actually has, so
 * `satisfies ControlValues` fails when a {@link ControlKey} lacks a row.
 */
type SpecValues = Record<SpecKey, string | boolean>;

const DEFAULTS = Object.fromEntries(
  controlRows.map((row) => [row.key, row.default]),
) as SpecValues satisfies ControlValues as Controls;

/** The defaults, as a fresh object. */
export function defaultControls(): Controls {
  return { ...DEFAULTS };
}

/** The two controls `da`, `db` and `lay` decide. */
export interface DerivedControls {
  /** Deployment: the event matrix's cell for this pairing and layout. */
  m: string;
  /** Terrain layout: the 40kdc layout matching that pairing and deployment. */
  t: string;
}

/**
 * The control keys {@link deriveControls} produces. A `Record` over
 * `keyof DerivedControls` so a new derived field is a type error until listed
 * (otherwise its dropdown would silently never be written).
 */
const DERIVED_KEYS = Object.keys({
  m: true,
  t: true,
} satisfies Record<keyof DerivedControls, true>) as readonly (keyof DerivedControls &
  ControlKey)[];

/**
 * Derives the deployment (`m`, via the event matrix) and terrain layout (`t`,
 * via 40kdc layout metadata) a disposition pairing implies. Returned rather
 * than written, since the visitor may override either.
 *
 * The 40kdc source does not cover every matrix cell; an uncovered one falls
 * back to the `t` default.
 *
 * @throws if the pairing or layout is not in the event matrix (a drift between
 * generated presets, since inputs are allowlisted against the matrix).
 */
export function deriveControls(controls: Controls): DerivedControls {
  // Safe cast: `lay` is allowlisted against `LAYOUT_IDS`.
  const m = resolveMission(
    eventMatrix,
    controls.da,
    controls.db,
    controls.lay as Layout,
  );
  return {
    m,
    t: resolveTerrainLayout(gwTerrain.layout, controls.da, controls.db, m) ?? DEFAULTS.t,
  };
}

/**
 * Coerces untrusted input (parsed URL, restored storage, anything) to a valid
 * `Controls`. Each field falls back to its default when absent, not in the
 * row's allowlist, or (for flags) not a boolean.
 */
export function sanitizeControls(input: unknown): Controls {
  const source = (input ?? {}) as Record<string, unknown>;
  const out: Partial<SpecValues> = {};
  // `controlSpec`, not `controlRows`: the literal tuple types `lay`'s
  // `allowed` as `Layout[]`, which `.includes(string)` rejects.
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
 * The query string (no leading `?`) for these controls, holding only those
 * that differ from their default; {@link controlsFromSearch} restores the rest.
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
 * Parses a flag param. Only `"1"`/`"0"` are recognised; anything else (e.g. a
 * hand-written `?territory=true`) takes the default rather than reading as off.
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

/** Reads controls out of a query string, sanitized; absent params take defaults. */
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

/** True when the query string carries any control, i.e. it is a shared link. */
function searchHasControls(search: string): boolean {
  const params = new URLSearchParams(search);
  return controlSpec.some((row) => params.has(row.key));
}

/** What a page load should come up showing, and whether to persist it. */
export interface InitialControls {
  readonly controls: Controls;
  /** Which editor drives the render. */
  readonly mode: "controls" | "yaml";
  /**
   * Text for the YAML editor, or null to leave the markup's text. Non-null
   * exactly when `mode` is `"yaml"`.
   */
  readonly yaml: string | null;
  /**
   * Whether to write this state back to storage on load. False for a
   * URL-driven load, so following a link does not clobber the visitor's saved
   * session; later edits persist as usual.
   */
  readonly persist: boolean;
}

/**
 * Resolves a page load's starting state from the query string and whatever
 * storage handed back (`saved` is untrusted, any shape). A query string
 * carrying any control wins outright, including over a saved YAML override,
 * and is not persisted (see `persist`).
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
  // A saved yaml mode without yaml text falls back to controls mode.
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
 * A document or any element containing the controls. Elements are found with
 * `querySelector` so a plain container works as a root (as in tests).
 */
export type ControlsRoot = Document | Element;

/**
 * The element a row is bound to, by id.
 *
 * @throws if the root has no element with the row's id, naming the control.
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
 * Reads the controls out of a DOM subtree, sanitized (a `<select>` set to a
 * value it has no `<option>` for reads back as `""`).
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
 * Writes the two derived controls into a DOM subtree.
 *
 * A derived value need not be in the dropdown's options, and a `<select>`
 * silently ignores such a value, so the write is read back and a mismatch
 * thrown rather than letting the UI and the render disagree.
 *
 * @throws if a control's element is absent, or its dropdown has no option for
 * the derived value.
 */
export function writeDerivedControlsToDom(
  root: ControlsRoot,
  derived: DerivedControls,
): void {
  for (const key of DERIVED_KEYS) {
    const row = controlSpec.find((candidate) => candidate.key === key);
    if (!row) throw new Error(`Control "${key}" has no spec row`);
    const element = controlElement(root, row) as HTMLSelectElement;
    element.value = derived[key];
    if (element.value !== derived[key]) {
      throw new Error(`Control "${key}" has no option "${derived[key]}"`);
    }
  }
}

/**
 * Writes every control into a DOM subtree.
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
