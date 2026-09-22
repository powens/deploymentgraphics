import { describe, it, expect } from "vitest";
import {
  controlSpec,
  controlsFromSearch,
  controlsToSearch,
  defaultControls,
  deriveControls,
  initialControls,
  sanitizeControls,
  type ControlRow,
  type Controls,
} from "./viewer-controls";
import {
  dispositions,
  eventMatrixKey,
  resolveTerrainLayout,
} from "./event-matrix";
import { eventMatrix } from "./presets/event-matrix";
import { missions } from "./presets/missions";
import { gwTerrain } from "./presets/terrain";

/**
 * The control set, pinned. Changing it changes the persisted shape: bump
 * `STORAGE_VERSION` in `static/state.js`.
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
  it("is Take and Hold vs Take and Hold, layout B", () => {
    expect(defaultControls()).toEqual({
      da: "Take and Hold",
      db: "Take and Hold",
      lay: "B",
      m: "dawn_of_war",
      t: "bm-take-vs-take-02",
      tpl: "real",
      grid: false,
      territory: true,
      rot: "0",
    });
  });

  it("draws the terrain layout its own pairing resolves to", () => {
    const d = defaultControls();
    expect(resolveTerrainLayout(gwTerrain.layout, d.da, d.db, d.m)).toBe(d.t);
  });

  it("hands out a fresh object", () => {
    const first = defaultControls();
    first.rot = "90";
    expect(defaultControls().rot).toBe("0");
  });
});

describe("deriveControls", () => {
  // Read off the `lay` row, not a literal, so a new variant is swept too.
  const layRow = controlSpec.find((row) => row.key === "lay");
  const LAYOUTS = layRow?.kind === "select" ? layRow.allowed : [];
  const cells = dispositions(eventMatrix).flatMap((da, i, all) =>
    all.slice(i).flatMap((db) => LAYOUTS.map((lay) => ({ da, db, lay }))),
  );

  it("derives the defaults' own pairing back to the default deployment and layout", () => {
    const d = defaultControls();
    expect(deriveControls(d)).toEqual({ m: d.m, t: d.t });
  });

  /**
   * Every cell must land on a value in its dropdown's allowlist, or
   * `writeDerivedControlsToDom` throws on the page.
   */
  it("derives a deployment and a terrain layout the presets carry, for every cell", () => {
    // Non-vacuity against the matrix rather than a literal count, so a
    // regenerated matrix does not break this.
    expect(LAYOUTS.length).toBeGreaterThan(0);
    expect(new Set(cells.map((c) => eventMatrixKey(c.da, c.db))).size).toBe(
      Object.keys(eventMatrix).length,
    );
    for (const cell of cells) {
      const { m, t } = deriveControls({ ...defaultControls(), ...cell });
      const where = `${cell.da} / ${cell.db} / ${cell.lay}`;
      expect(missions[m as keyof typeof missions], `${where} -> m`).toBeDefined();
      expect(gwTerrain.layout[t], `${where} -> t`).toBeDefined();
    }
  });

  /**
   * The 40kdc source covers every matrix cell today, so the `deriveControls`
   * fallback is unreached. This fails, naming the cell, if that changes.
   */
  it("matches a 40kdc layout for every cell, so nothing falls back", () => {
    for (const cell of cells) {
      const { m, t } = deriveControls({ ...defaultControls(), ...cell });
      expect(
        resolveTerrainLayout(gwTerrain.layout, cell.da, cell.db, m),
        `${cell.da} / ${cell.db} / ${cell.lay}`,
      ).toBe(t);
    }
  });

  it("throws for a pairing the event matrix has no entry for", () => {
    expect(() =>
      deriveControls({ ...defaultControls(), da: "Nonesuch" }),
    ).toThrow(/No event-matrix entry/);
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
    // The flags have opposite defaults, so junk must land on each row's own.
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
    // Hand-written links: unrecognised flag spellings keep the default.
    expect(controlsFromSearch("territory=true").territory).toBe(true);
    expect(controlsFromSearch("territory=").territory).toBe(true);
    expect(controlsFromSearch("grid=true").grid).toBe(false);
    expect(controlsFromSearch("grid=").grid).toBe(false);
  });

  it("sanitizes what the URL carries", () => {
    expect(controlsFromSearch("t=no-such-layout").t).toBe("bm-take-vs-take-02");
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
    // Non-control params (analytics etc.) do not make a shared link.
    const saved = savedSession({ controls: { rot: "90" } });
    const initial = initialControls({ search: "?utm_source=x", saved });
    expect(initial.controls.rot).toBe("90");
    expect(initial.persist).toBe(true);
  });

  for (const row of controlSpec) {
    it(`treats a bare "${row.key}" as a shared link`, () => {
      // Even a valueless control param makes it a shared link.
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
      saved: savedSession({ controls: { t: "bm-take-vs-take-01", grid: true } }),
    });
    expect(initial.controls).toEqual({
      ...defaultControls(),
      t: "bm-take-vs-take-01",
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
    expect(initial.controls.t).toBe("bm-take-vs-take-02");
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
    // A shared link must render the link, not the visitor's saved YAML.
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
    // An empty editor is still the visitor's state; don't discard it.
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
