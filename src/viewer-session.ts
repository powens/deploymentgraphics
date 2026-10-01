/**
 * The viewer's **Viewer session**: the visitor's Controls, which editor drives
 * the render, and the YAML text when the YAML editor does. Every transition
 * returns a full {@link Snapshot} for `static/app.js` to write back, so the page
 * never depends on the order it applies them in. Demo-only (reached via
 * `bundle.ts`).
 */
import * as yaml from "js-yaml";
import { makeMissionCard } from "./main.js";
import { buildConfig } from "./presets/build-config.js";
import { baseConfig } from "./presets/base.js";
import { missions } from "./presets/missions.js";
import type { FullConfig } from "./types.js";
import {
  controlsFromSearch,
  controlSpec,
  controlsToSearch,
  defaultControls,
  deriveControls,
  sanitizeControls,
  terrainForTemplateSet,
  type Controls,
} from "./viewer-controls.js";

/** Which editor drives the render. */
export type Mode = "controls" | "yaml";

export interface Session {
  readonly controls: Controls;
  readonly mode: Mode;
  /** The YAML editor's text: non-null exactly when `mode` is `"yaml"`. */
  readonly yaml: string | null;
}

/** A card to draw, or why there is none. */
export type RenderInstruction =
  | { readonly config: FullConfig; readonly rotation: number }
  | { readonly error: string };

/** Everything the page shows for a session. */
export interface Snapshot {
  readonly session: Session;
  /** The URL's query string, without `?`; `""` for a bare URL. */
  readonly query: string;
  /** The text to store under {@link STORAGE_KEY}, or null to store nothing. */
  readonly stored: string | null;
  /** What to draw, or null to leave the stage as it is. */
  readonly render: RenderInstruction | null;
  readonly yamlError: string | null;
  /** The export filename, without extension. */
  readonly filenameStem: string;
}

export type SessionEvent =
  /** The visitor changed any control; `controls` is the whole set, as read. */
  | { readonly type: "controlsEdited"; readonly controls: Controls }
  /** A keystroke in the YAML editor: takes over the render, draws nothing yet. */
  | { readonly type: "yamlTyped"; readonly text: string }
  /** The YAML editor has gone quiet: draw what it holds. */
  | { readonly type: "yamlSettled" }
  /** Hand the render back to the controls. */
  | { readonly type: "reset" };

export const STORAGE_KEY = "deploymentgraphics:state";

/**
 * Bump whenever the stored form changes, including the control set (pinned in
 * `viewer-controls.test.ts`); a session stored under another version is
 * dropped.
 */
export const STORAGE_VERSION = 2;

const DERIVATION_INPUTS = ["da", "db", "lay"] as const satisfies readonly (keyof Controls)[];

function configFor(controls: Controls): FullConfig {
  return buildConfig({
    mission: missions[controls.m as keyof typeof missions],
    base: baseConfig,
    terrain: terrainForTemplateSet(controls.tpl),
    layout: controls.t,
    grid: controls.grid,
    territory: controls.territory,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The render for the session's own mode, plus any YAML error found on the way. */
function renderOf(session: Session): Pick<Snapshot, "render" | "yamlError"> {
  const rotation = Number(session.controls.rot);
  if (session.mode === "controls") {
    try {
      return { render: { config: configFor(session.controls), rotation }, yamlError: null };
    } catch (error) {
      return { render: { error: errorMessage(error) }, yamlError: null };
    }
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(session.yaml ?? "");
  } catch (error) {
    return { render: null, yamlError: errorMessage(error) };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { render: null, yamlError: "YAML must describe a config object." };
  }
  // Unvalidated: the renderer reports what it cannot draw.
  return { render: { config: parsed as FullConfig, rotation }, yamlError: null };
}

function snapshotOf(
  session: Session,
  render: Pick<Snapshot, "render" | "yamlError">,
  { store = true }: { store?: boolean } = {},
): Snapshot {
  const { controls, mode } = session;
  return {
    session,
    // The URL cannot carry a YAML override; a bare one lets a reload fall
    // through to the stored session.
    query: mode === "yaml" ? "" : controlsToSearch(controls),
    stored: store
      ? JSON.stringify({ version: STORAGE_VERSION, ...session })
      : null,
    ...render,
    filenameStem:
      mode === "yaml"
        ? "deployment-graphics"
        : `${controls.m.replace(/_/g, "-")}-${controls.t}`,
  };
}

/** The stored session, or null when the text is absent, unreadable or stale. */
function restore(saved: string | null): Session | null {
  let blob: unknown;
  try {
    blob = JSON.parse(saved ?? "null");
  } catch {
    return null;
  }
  if (!blob || typeof blob !== "object") return null;
  const { version, controls, mode, yaml: text } = blob as Record<string, unknown>;
  if (version !== STORAGE_VERSION) return null;
  // A stored yaml mode without yaml text falls back to controls mode.
  const override = mode === "yaml" && typeof text === "string" ? text : null;
  return {
    controls: sanitizeControls(controls),
    mode: override === null ? "controls" : "yaml",
    yaml: override,
  };
}

/** True when the query string carries any control, i.e. it is a shared link. */
function searchHasControls(search: string): boolean {
  const params = new URLSearchParams(search);
  return controlSpec.some((row) => params.has(row.key));
}

/**
 * A page load's session, from the query string and the stored text (untrusted,
 * any shape). A query string carrying any control wins outright, including
 * over a stored YAML override, and is not stored, so following a link does not
 * clobber the visitor's own session.
 */
export function openSession({
  search,
  saved,
}: {
  search: string;
  saved: string | null;
}): Snapshot {
  if (searchHasControls(search)) {
    const session: Session = {
      controls: controlsFromSearch(search),
      mode: "controls",
      yaml: null,
    };
    return snapshotOf(session, renderOf(session), { store: false });
  }
  const session = restore(saved) ?? {
    controls: defaultControls(),
    mode: "controls",
    yaml: null,
  };
  return snapshotOf(session, renderOf(session));
}

/** The session after one event, and what the page shows for it. */
export function step(session: Session, event: SessionEvent): Snapshot {
  switch (event.type) {
    case "controlsEdited": {
      const { controls } = event;
      const rederive = DERIVATION_INPUTS.some(
        (key) => controls[key] !== session.controls[key],
      );
      if (!rederive) {
        const next = { ...session, controls };
        return snapshotOf(next, renderOf(next));
      }
      try {
        const next = { ...session, controls: { ...controls, ...deriveControls(controls) } };
        return snapshotOf(next, renderOf(next));
      } catch (error) {
        // Only a drift between the generated presets gets here: say so loudly.
        const next = { ...session, controls };
        return snapshotOf(next, { render: { error: errorMessage(error) }, yamlError: null });
      }
    }
    case "yamlTyped": {
      const next: Session = { ...session, mode: "yaml", yaml: event.text };
      return snapshotOf(next, { render: null, yamlError: null });
    }
    case "yamlSettled":
      return snapshotOf(session, renderOf(session));
    case "reset": {
      const next: Session = { ...session, mode: "controls", yaml: null };
      return snapshotOf(next, renderOf(next));
    }
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Turns the card by ±90° inside the SVG (swap the viewBox, wrap the content in
 * a rotated group) rather than via CSS, so layout sizing and exports match the
 * screen. The `<title>` stays a direct child for accessibility.
 */
function rotateCard(svg: SVGElement, rotation: number): SVGElement {
  if (rotation !== 90 && rotation !== -90) return svg;
  const [, , w, h] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const group = svg.ownerDocument.createElementNS(SVG_NS, "g");
  group.setAttribute(
    "transform",
    rotation === 90 ? `translate(${h} 0) rotate(90)` : `translate(0 ${w}) rotate(-90)`,
  );
  for (const child of Array.from(svg.childNodes)) {
    if (child.nodeName !== "title") group.appendChild(child);
  }
  svg.appendChild(group);
  svg.setAttribute("viewBox", `0 0 ${h} ${w}`);
  return svg;
}

/**
 * Draws an instruction as an off-DOM `<svg>`, so a failure never touches the
 * stage. Needs a DOM (see `makeMissionCard`).
 */
export function renderCard(
  instruction: RenderInstruction,
): { card: SVGElement } | { error: string } {
  if ("error" in instruction) return instruction;
  try {
    const card = makeMissionCard(instruction.config);
    return { card: rotateCard(card, instruction.rotation) };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/**
 * The text to put in the YAML editor when it opens: the controls' config, or
 * null to leave the visitor's own YAML (and their cursor) alone. Only the
 * selected layout is kept: the rest of the corpus draws nothing, and would
 * fill the editor (and storage, on every edit) with hundreds of KB.
 */
export function editorYaml(session: Session): string | null {
  if (session.mode === "yaml") return null;
  const config = configFor(session.controls);
  const { layout, layout_name: selected } = config.terrain;
  return yaml.dump({
    ...config,
    terrain: {
      ...config.terrain,
      layout: Object.prototype.hasOwnProperty.call(layout, selected) ? { [selected]: layout[selected] } : {},
    },
  });
}
