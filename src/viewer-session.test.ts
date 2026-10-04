import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import {
  editorYaml,
  openSession,
  step,
  STORAGE_VERSION,
  type RenderInstruction,
  type Session,
  type Snapshot,
} from "./viewer-session";
import { defaultControls, deriveControls, type Controls } from "./viewer-controls";
import { buildConfig } from "./presets/build-config";
import { missions } from "./presets/missions";

/** A stored session, in the text form `snapshot.stored` carries. */
function stored(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: STORAGE_VERSION,
    mode: "controls",
    controls: {},
    yaml: null,
    ...overrides,
  });
}

function fresh(): Snapshot {
  return openSession({ search: "", saved: null });
}

function rendered(snapshot: Snapshot): Exclude<RenderInstruction, { error: string }> {
  const { render } = snapshot;
  if (render === null || "error" in render) {
    throw new Error(`expected a card to render, got ${JSON.stringify(render)}`);
  }
  return render;
}

/** A config the renderer accepts, as the YAML editor would hold it. */
const CONFIG_YAML = yaml.dump(buildConfig({ mission: missions.dawn_of_war }));
const CONFIG = yaml.load(CONFIG_YAML);

function inYaml(text: string, controls: Controls = defaultControls()): Session {
  return { controls, mode: "yaml", yaml: text };
}

describe("openSession", () => {
  it("falls back to the defaults with no URL and nothing saved", () => {
    const snapshot = fresh();
    expect(snapshot.session).toEqual({
      controls: defaultControls(),
      mode: "controls",
      yaml: null,
    });
    expect(snapshot.query).toBe("");
    expect(snapshot.stored).not.toBe(null);
  });

  it("ignores a query string carrying no control", () => {
    // Non-control params (analytics etc.) do not make a shared link.
    const snapshot = openSession({
      search: "?utm_source=x",
      saved: stored({ controls: { rot: "90" } }),
    });
    expect(snapshot.session.controls.rot).toBe("90");
    expect(snapshot.stored).not.toBe(null);
  });

  it("follows a shared link over a saved session, without saving it", () => {
    // Following a link must not clobber the visitor's saved session.
    const snapshot = openSession({
      search: "?t=",
      saved: stored({ controls: { rot: "90" } }),
    });
    expect(snapshot.session.controls.rot).toBe("0");
    expect(snapshot.stored).toBe(null);
  });

  it("keeps a URL over a saved yaml override, which a URL cannot express", () => {
    const snapshot = openSession({
      search: "?rot=90",
      saved: stored({ mode: "yaml", yaml: "canvas: {}" }),
    });
    expect(snapshot.session).toEqual({
      controls: { ...defaultControls(), rot: "90" },
      mode: "controls",
      yaml: null,
    });
  });

  it("restores what it stored", () => {
    const edited = step(fresh().session, {
      type: "controlsEdited",
      controls: { ...defaultControls(), t: "bm-take-vs-take-01", grid: true },
    });
    const reopened = openSession({ search: "", saved: edited.stored });
    expect(reopened.session).toEqual(edited.session);
  });

  it("restores a yaml session it stored", () => {
    const typed = step(fresh().session, { type: "yamlTyped", text: "canvas: {}" });
    const reopened = openSession({ search: "", saved: typed.stored });
    expect(reopened.session).toEqual(inYaml("canvas: {}"));
  });

  it("sanitizes the saved controls rather than trusting them", () => {
    const { controls } = openSession({
      search: "",
      saved: stored({ controls: { t: "no-such-layout", grid: "yes" } }),
    }).session;
    expect(controls.t).toBe("bm-take-vs-take-02");
    expect(controls.grid).toBe(false);
  });

  it("falls back to controls mode when the saved yaml is not text", () => {
    for (const text of [null, 42]) {
      const { session } = openSession({
        search: "",
        saved: stored({ mode: "yaml", yaml: text }),
      });
      expect(session.mode).toBe("controls");
      expect(session.yaml).toBe(null);
    }
  });

  it("keeps an empty saved override, which is still an override", () => {
    const { session } = openSession({
      search: "",
      saved: stored({ mode: "yaml", yaml: "" }),
    });
    expect(session).toEqual(inYaml(""));
  });

  it("drops a session saved under another control set", () => {
    const { session } = openSession({
      search: "",
      saved: stored({ version: STORAGE_VERSION - 1, controls: { rot: "90" } }),
    });
    expect(session.controls).toEqual(defaultControls());
  });

  for (const saved of ["{not json", "null", "7", '"text"', "{}"]) {
    it(`survives ${saved} from storage`, () => {
      const snapshot = openSession({ search: "", saved });
      expect(snapshot.session.controls).toEqual(defaultControls());
      expect(snapshot.stored).not.toBe(null);
    });
  }

  it("renders the controls' config at their rotation", () => {
    const snapshot = openSession({ search: "?rot=-90", saved: null });
    expect(rendered(snapshot)).toEqual({
      config: buildConfig({
        mission: missions.dawn_of_war,
        terrain: rendered(snapshot).config.terrain,
        layout: "bm-take-vs-take-02",
        grid: false,
        territory: true,
      }),
      rotation: -90,
    });
  });

  it("renders a saved yaml override at the saved rotation", () => {
    const snapshot = openSession({
      search: "",
      saved: stored({ mode: "yaml", yaml: CONFIG_YAML, controls: { rot: "90" } }),
    });
    expect(rendered(snapshot)).toEqual({ config: CONFIG, rotation: 90 });
  });
});

describe("step: controlsEdited", () => {
  it("re-derives the deployment and terrain when a disposition changes", () => {
    const controls = { ...defaultControls(), db: "Purge the Foe" };
    const { session } = step(fresh().session, { type: "controlsEdited", controls });
    expect(session.controls).toEqual({ ...controls, ...deriveControls(controls) });
  });

  it("keeps a deployment the visitor overrode", () => {
    const controls = { ...defaultControls(), m: "search_and_destroy" };
    const { session } = step(fresh().session, { type: "controlsEdited", controls });
    expect(session.controls.m).toBe("search_and_destroy");
  });

  it("reports a pairing the event matrix lacks, and still saves the picks", () => {
    const controls = { ...defaultControls(), da: "No such disposition" };
    const snapshot = step(fresh().session, { type: "controlsEdited", controls });
    expect(snapshot.render).toEqual({ error: expect.any(String) });
    expect(snapshot.session.controls.da).toBe("No such disposition");
    expect(snapshot.stored).not.toBe(null);
  });

  it("carries only the controls that differ from their default in the URL", () => {
    const controls = { ...defaultControls(), grid: true };
    const snapshot = step(fresh().session, { type: "controlsEdited", controls });
    expect(snapshot.query).toBe("grid=1");
  });

  it("re-renders a yaml override at a new rotation", () => {
    const snapshot = step(inYaml(CONFIG_YAML), {
      type: "controlsEdited",
      controls: { ...defaultControls(), rot: "90" },
    });
    expect(snapshot.session.mode).toBe("yaml");
    expect(rendered(snapshot)).toEqual({ config: CONFIG, rotation: 90 });
  });
});

describe("step: yamlTyped", () => {
  it("hands the render to the YAML editor without rendering yet", () => {
    const snapshot = step(fresh().session, { type: "yamlTyped", text: "a: 1" });
    expect(snapshot.session).toEqual(inYaml("a: 1"));
    expect(snapshot.render).toBe(null);
  });

  it("keeps the URL bare, which cannot carry an override", () => {
    const controls = { ...defaultControls(), grid: true };
    const snapshot = step(
      { controls, mode: "controls", yaml: null },
      { type: "yamlTyped", text: "a: 1" },
    );
    expect(snapshot.query).toBe("");
  });
});

describe("step: yamlSettled", () => {
  it("renders the parsed YAML at the controls' rotation", () => {
    const controls = { ...defaultControls(), rot: "-90" };
    const snapshot = step(inYaml(CONFIG_YAML, controls), { type: "yamlSettled" });
    expect(rendered(snapshot)).toEqual({ config: CONFIG, rotation: -90 });
    expect(snapshot.yamlError).toBe(null);
  });

  it("reports unparseable YAML and leaves the stage alone", () => {
    const snapshot = step(inYaml("a: [1"), { type: "yamlSettled" });
    expect(snapshot.yamlError).toEqual(expect.any(String));
    expect(snapshot.render).toBe(null);
  });

  /** `CONFIG_YAML` holding only layout `bm-mine`, with `name` selected. */
  const selecting = (name: string): string =>
    yaml.dump({
      ...(CONFIG as object),
      terrain: { templates: {}, layout: { "bm-mine": {} }, layout_name: name },
    });

  // The editor holds only the selected layout, so renaming it is easy to do.
  it("names a layout_name the YAML does not define, and leaves the stage alone", () => {
    const snapshot = step(inYaml(selecting("bm-other")), { type: "yamlSettled" });
    expect(snapshot.yamlError).toBe(
      'unknown layout "bm-other": the editor holds only the layout the controls selected; ' +
        "pick another layout there, or add it under terrain.layout.",
    );
    expect(snapshot.render).toBe(null);
  });

  // With layout "none" selected the editor holds `layout: {}`.
  it("gives the editor's hint, not the library's, when terrain.layout is empty", () => {
    const text = yaml.dump({
      ...(CONFIG as object),
      terrain: { templates: {}, layout: {}, layout_name: "bm-mine" },
    });
    const snapshot = step(inYaml(text), { type: "yamlSettled" });
    expect(snapshot.yamlError).toMatch(/^unknown layout "bm-mine": the editor holds only/);
  });

  it("renders a layout_name the YAML defines", () => {
    const snapshot = step(inYaml(selecting("bm-mine")), { type: "yamlSettled" });
    expect(snapshot.yamlError).toBe(null);
  });

  it("names the field of a config the renderer could not draw", () => {
    const snapshot = step(inYaml("canvas: {}"), { type: "yamlSettled" });
    expect(snapshot.yamlError).toBe("config.base: expected an object, got undefined");
    expect(snapshot.render).toBe(null);
  });

  for (const text of ["just a string", "- a list"]) {
    it(`rejects ${JSON.stringify(text)}, which is no config object`, () => {
      const snapshot = step(inYaml(text), { type: "yamlSettled" });
      expect(snapshot.yamlError).toBe("YAML must describe a config object.");
      expect(snapshot.render).toBe(null);
    });
  }
});

describe("step: reset", () => {
  it("hands the render back to the controls", () => {
    const controls = { ...defaultControls(), grid: true };
    const snapshot = step(inYaml("canvas: {}", controls), { type: "reset" });
    expect(snapshot.session).toEqual({ controls, mode: "controls", yaml: null });
    expect(snapshot.query).toBe("grid=1");
    expect(rendered(snapshot).config.base.grid.draw).toBe(true);
    expect(snapshot.yamlError).toBe(null);
  });
});

describe("filenameStem", () => {
  it("names the deployment and terrain layout the card shows", () => {
    const controls = { ...defaultControls(), m: "search_and_destroy" };
    const snapshot = step(fresh().session, { type: "controlsEdited", controls });
    expect(snapshot.filenameStem).toBe("search-and-destroy-bm-take-vs-take-02");
  });

  it("falls back to a generic name for a yaml override", () => {
    const snapshot = step(fresh().session, { type: "yamlTyped", text: "a: 1" });
    expect(snapshot.filenameStem).toBe("deployment-graphics");
  });
});

describe("editorYaml", () => {
  it("fills the editor with the controls' config, less the unselected layouts", () => {
    const snapshot = fresh();
    const { config } = rendered(snapshot);
    const { t } = snapshot.session.controls;
    expect(yaml.load(editorYaml(snapshot.session)!)).toEqual({
      ...config,
      terrain: { ...config.terrain, layout: { [t]: config.terrain.layout[t] } },
    });
  });

  it("dumps no layout when the controls select none", () => {
    const session: Session = {
      controls: { ...defaultControls(), t: "" },
      mode: "controls",
      yaml: null,
    };
    const dumped = yaml.load(editorYaml(session)!) as { terrain: { layout: object } };
    expect(dumped.terrain.layout).toEqual({});
  });

  it("leaves the visitor's own YAML in place", () => {
    expect(editorYaml(inYaml("a: 1"))).toBe(null);
  });
});
