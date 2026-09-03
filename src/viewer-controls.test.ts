import { describe, it, expect } from "vitest";
import {
  controlSpec,
  controlsFromSearch,
  controlsToSearch,
  defaultControls,
  initialControls,
  sanitizeControls,
  type ControlRow,
  type Controls,
} from "./viewer-controls";

/**
 * The control set, pinned. Changing it is a persisted-shape change: bump
 * `STORAGE_VERSION` in `static/state.js` so saved state from the old set is
 * dropped rather than half-restored.
 */
const EXPECTED_KEYS = [
  "da",
  "db",
  "lay",
  "m",
  "t",
  "tpl",
  "grid",
  "territory",
  "rot",
];

/** A legal value for this control other than its default. */
function otherValue(row: ControlRow): string | boolean {
  if (row.kind === "checkbox") {
    return !row.default;
  }
  const other = row.allowed.find((value) => value !== row.default);
  if (other === undefined) {
    throw new Error(`Control "${row.key}" has no non-default value`);
  }
  return other;
}

function withControl(row: ControlRow, value: unknown): Controls {
  return { ...defaultControls(), [row.key]: value } as Controls;
}

describe("controlSpec", () => {
  it("holds one row per control key, in URL-param order", () => {
    expect(controlSpec.map((row) => row.key)).toEqual(EXPECTED_KEYS);
  });

  it("gives every control its own element", () => {
    const ids = controlSpec.map((row) => row.elementId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers every layout variant the union spells, in order", () => {
    const lay = controlSpec.find((row) => row.key === "lay");
    expect(lay?.kind === "select" && lay.allowed).toEqual(["A", "B", "C"]);
  });

  it("gives every select at least two values to choose between", () => {
    for (const row of controlSpec) {
      if (row.kind === "select") {
        expect(row.allowed.length, row.key).toBeGreaterThan(1);
        expect(row.allowed, row.key).toContain(row.default);
      }
    }
  });
});

describe("defaultControls", () => {
  it("is the previous default render", () => {
    expect(defaultControls()).toEqual({
      da: "Take and Hold",
      db: "Take and Hold",
      lay: "B",
      m: "dawn_of_war",
      t: "1",
      tpl: "real",
      grid: false,
      territory: true,
      rot: "0",
    });
  });

  it("hands out a fresh object", () => {
    const first = defaultControls();
    first.rot = "90";
    expect(defaultControls().rot).toBe("0");
  });
});

describe("sanitizeControls", () => {
  it("falls back to defaults for absent, empty and unparseable input", () => {
    expect(sanitizeControls(undefined)).toEqual(defaultControls());
    expect(sanitizeControls(null)).toEqual(defaultControls());
    expect(sanitizeControls({})).toEqual(defaultControls());
  });

  for (const row of controlSpec) {
    it(`falls back to the default for an unknown "${row.key}"`, () => {
      expect(sanitizeControls(withControl(row, "no-such-value"))).toEqual(
        defaultControls(),
      );
    });

    it(`keeps a legal non-default "${row.key}"`, () => {
      const value = otherValue(row);
      expect(sanitizeControls(withControl(row, value))).toEqual(
        withControl(row, value),
      );
    });
  }

  it("coerces a numeric rotation, as restored state may hold one", () => {
    expect(sanitizeControls({ rot: 90 }).rot).toBe("90");
  });

  it("rejects a non-boolean flag whichever way its default points", () => {
    // The two flags default in opposite directions, so a junk value has to
    // land on the row's own default rather than on `false`.
    expect(sanitizeControls({ grid: "yes" }).grid).toBe(false);
    expect(sanitizeControls({ territory: "no" }).territory).toBe(true);
    expect(sanitizeControls({ grid: null }).grid).toBe(false);
    expect(sanitizeControls({ territory: null }).territory).toBe(true);
  });
});

describe("controlsToSearch", () => {
  it("writes nothing for a default-state link", () => {
    expect(controlsToSearch(defaultControls())).toBe("");
  });

  for (const row of controlSpec) {
    it(`omits "${row.key}" at its default`, () => {
      const search = controlsToSearch(withControl(row, row.default));
      expect(new URLSearchParams(search).has(row.key)).toBe(false);
    });
  }

  it("spells a differing flag as 1 or 0, whichever way it differs", () => {
    // One rule — "differs from the default" — not two special cases.
    expect(controlsToSearch({ ...defaultControls(), grid: true })).toBe(
      "grid=1",
    );
    expect(controlsToSearch({ ...defaultControls(), territory: false })).toBe(
      "territory=0",
    );
  });
});

describe("controlsFromSearch", () => {
  it("restores every absent param to its default", () => {
    expect(controlsFromSearch("")).toEqual(defaultControls());
    expect(controlsFromSearch("?unrelated=1")).toEqual(defaultControls());
  });

  for (const row of controlSpec) {
    it(`round-trips a non-default "${row.key}" through the URL`, () => {
      const controls = withControl(row, otherValue(row));
      expect(controlsFromSearch(controlsToSearch(controls))).toEqual(controls);
    });
  }

  it("reads a flag from the URL against its own default", () => {
    expect(controlsFromSearch("grid=1").grid).toBe(true);
    expect(controlsFromSearch("grid=0").grid).toBe(false);
    expect(controlsFromSearch("territory=0").territory).toBe(false);
    expect(controlsFromSearch("territory=1").territory).toBe(true);
  });

  it("keeps a flag's default for a spelling it never wrote", () => {
    // Hand-written links. `?territory=true` and `?territory=` drew the
    // territory line before the spec owned this parse, and still do.
    expect(controlsFromSearch("territory=true").territory).toBe(true);
    expect(controlsFromSearch("territory=").territory).toBe(true);
    expect(controlsFromSearch("grid=true").grid).toBe(false);
    expect(controlsFromSearch("grid=").grid).toBe(false);
  });

  it("sanitizes what the URL carries", () => {
    expect(controlsFromSearch("t=no-such-layout").t).toBe("1");
  });
});

describe("initialControls", () => {
  /** A saved session, in the shape `static/state.js` hands back. */
  function savedSession(overrides: Record<string, unknown> = {}) {
    return { version: 2, mode: "controls", controls: {}, yaml: null, ...overrides };
  }

  it("falls back to the defaults with no URL and nothing saved", () => {
    expect(initialControls({ search: "", saved: null })).toEqual({
      controls: defaultControls(),
      mode: "controls",
      yaml: null,
      persist: true,
    });
  });

  it("ignores a query string carrying no control", () => {
    // Analytics params and the like are not a shared link, so saved state
    // still wins.
    const saved = savedSession({ controls: { rot: "90" } });
    const initial = initialControls({ search: "?utm_source=x", saved });
    expect(initial.controls.rot).toBe("90");
    expect(initial.persist).toBe(true);
  });

  for (const row of controlSpec) {
    it(`treats a bare "${row.key}" as a shared link`, () => {
      // Any control in the URL makes it explicit — even valueless, and even
      // when saved state exists and would otherwise have won.
      const initial = initialControls({
        search: `?${row.key}=`,
        saved: savedSession({ controls: { rot: "90" } }),
      });
      expect(initial.persist).toBe(false);
      expect(initial.controls.rot).toBe("0");
    });
  }

  it("restores a saved session, and lets it persist", () => {
    const initial = initialControls({
      search: "",
      saved: savedSession({ controls: { t: "1", grid: true } }),
    });
    expect(initial.controls).toEqual({
      ...defaultControls(),
      t: "1",
      grid: true,
    });
    expect(initial.mode).toBe("controls");
    expect(initial.yaml).toBe(null);
    expect(initial.persist).toBe(true);
  });

  it("sanitizes the saved controls rather than trusting them", () => {
    const initial = initialControls({
      search: "",
      saved: savedSession({ controls: { t: "no-such-layout", grid: "yes" } }),
    });
    expect(initial.controls.t).toBe("1");
    expect(initial.controls.grid).toBe(false);
  });

  it("comes up in yaml mode when the saved session holds an override", () => {
    const initial = initialControls({
      search: "",
      saved: savedSession({ mode: "yaml", yaml: "canvas: {}" }),
    });
    expect(initial.mode).toBe("yaml");
    expect(initial.yaml).toBe("canvas: {}");
    expect(initial.persist).toBe(true);
  });

  it("keeps a URL over a saved yaml override, which a URL cannot express", () => {
    // The rule that matters most: a shared link must render the link, not the
    // visitor's own half-finished YAML.
    const initial = initialControls({
      search: "?rot=90",
      saved: savedSession({ mode: "yaml", yaml: "canvas: {}" }),
    });
    expect(initial.mode).toBe("controls");
    expect(initial.yaml).toBe(null);
    expect(initial.controls.rot).toBe("90");
    expect(initial.persist).toBe(false);
  });

  it("falls back to controls mode when the saved yaml is not text", () => {
    for (const yaml of [null, undefined, 42]) {
      const initial = initialControls({
        search: "",
        saved: savedSession({ mode: "yaml", yaml }),
      });
      expect(initial.mode).toBe("controls");
      expect(initial.yaml).toBe(null);
    }
  });

  it("keeps an empty saved override, which is still an override", () => {
    // A cleared editor is a state the visitor put themselves in; coming back
    // to controls mode would silently discard it.
    const initial = initialControls({
      search: "",
      saved: savedSession({ mode: "yaml", yaml: "" }),
    });
    expect(initial.mode).toBe("yaml");
    expect(initial.yaml).toBe("");
  });

  for (const saved of [undefined, "not an object", 7, {}]) {
    it(`survives ${JSON.stringify(saved) ?? "undefined"} from storage`, () => {
      const initial = initialControls({ search: "", saved });
      expect(initial.controls).toEqual(defaultControls());
      expect(initial.persist).toBe(true);
    });
  }

  it("hands out a fresh controls object each time", () => {
    const first = initialControls({ search: "", saved: null }).controls;
    first.rot = "90";
    expect(initialControls({ search: "", saved: null }).controls.rot).toBe("0");
  });
});
