// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
// `?raw` rather than `readFileSync`: this file runs under happy-dom, where
// `import.meta.url` is an http URL and cannot be turned back into a path.
import markup from "./index.html?raw";
import { controlSpec } from "../src/viewer-controls.js";

/**
 * The viewer markup's contract with the control spec.
 *
 * `index.html` is copied into `dist/` verbatim — never compiled, and nothing
 * else reads it — so an element id renamed on either side of the seam, or an
 * `<option>` the spec's allowlist does not accept, broke the page silently
 * with the whole suite green. Parsing the file is the only way to hold the two
 * together.
 */
const doc = new DOMParser().parseFromString(markup, "text/html");
const panel = doc.getElementById("panel-controls");

function element(row) {
  return panel.querySelector(`#${row.elementId}`);
}

function optionValues(row) {
  return [...panel.querySelectorAll(`#${row.elementId} option`)].map(
    (option) => option.value,
  );
}

describe("the controls panel", () => {
  it("holds exactly the controls in the spec", () => {
    // Both directions: a spec row with no element, and an element with no spec
    // row (which nothing would read, write, persist or put in the URL).
    const found = [...panel.querySelectorAll("select, input[type=checkbox]")]
      .map((el) => el.id)
      .sort();
    expect(found).toEqual(controlSpec.map((row) => row.elementId).sort());
  });

  for (const row of controlSpec) {
    it(`binds "${row.key}" to a ${row.kind} at #${row.elementId}`, () => {
      const el = element(row);
      expect(el).not.toBe(null);
      if (row.kind === "checkbox") {
        expect(el.tagName.toLowerCase()).toBe("input");
        expect(el.getAttribute("type")).toBe("checkbox");
      } else {
        expect(el.tagName.toLowerCase()).toBe("select");
      }
    });
  }
});

describe("markup-owned options", () => {
  const staticRows = controlSpec.filter(
    (row) => row.kind === "select" && row.staticOptions,
  );

  it("are the ones app.js does not populate", () => {
    expect(staticRows.map((row) => row.key)).toEqual(["tpl", "rot"]);
  });

  for (const row of staticRows) {
    it(`#${row.elementId} offers exactly the allowed values`, () => {
      expect(optionValues(row)).toEqual([...row.allowed]);
    });
  }
});

describe("app-populated selects", () => {
  const dynamicRows = controlSpec.filter(
    (row) => row.kind === "select" && !row.staticOptions,
  );

  it("cover the rest of the selects", () => {
    expect(dynamicRows.map((row) => row.key)).toEqual(["da", "db", "lay", "m", "t"]);
  });

  for (const row of dynamicRows) {
    it(`#${row.elementId} starts empty for app.js to fill`, () => {
      // An <option> left in the markup here would be appended to, not
      // replaced: the dropdown would offer it twice.
      expect(optionValues(row)).toEqual([]);
    });
  }
});

describe("the markup's initial state", () => {
  // Only the markup-owned controls have one to check: the rest are empty until
  // `start()` writes the URL, saved or default controls into them.
  for (const row of controlSpec) {
    if (row.kind === "checkbox") {
      it(`#${row.elementId} is ${row.default ? "checked" : "unchecked"}`, () => {
        expect(element(row).hasAttribute("checked")).toBe(row.default);
      });
    } else if (row.staticOptions) {
      it(`#${row.elementId} selects "${row.default}"`, () => {
        expect(element(row).value).toBe(row.default);
      });
    }
  }
});
