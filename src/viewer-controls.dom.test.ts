// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  type ControlRow,
  type Controls,
  controlElement,
  controlSpec,
  defaultControls,
  readControlsFromDom,
  setControlsLocked,
  writeControlsToDom,
} from "./viewer-controls.js";

/**
 * A panel holding one element per spec row, with `<select>` options from the
 * row's allowlist. Markup-vs-spec is checked in `static/index.test.js`.
 */
function panel(): HTMLElement {
  const root = document.createElement("div");
  for (const row of controlSpec) {
    if (row.kind === "checkbox") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = row.elementId;
      root.appendChild(input);
      continue;
    }
    const select = document.createElement("select");
    select.id = row.elementId;
    for (const value of row.allowed) {
      const option = document.createElement("option");
      option.value = value;
      select.appendChild(option);
    }
    root.appendChild(select);
  }
  return root;
}

const selectRows = controlSpec.filter((row) => row.kind === "select");
const checkboxRows = controlSpec.filter((row) => row.kind === "checkbox");

/** A legal value for this control that is not its default. */
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

describe("writeControlsToDom / readControlsFromDom", () => {
  it("round-trips the defaults", () => {
    const root = panel();
    writeControlsToDom(root, defaultControls());
    expect(readControlsFromDom(root)).toEqual(defaultControls());
  });

  for (const row of controlSpec) {
    it(`round-trips a non-default "${row.key}"`, () => {
      const root = panel();
      const controls = withControl(row, otherValue(row));
      writeControlsToDom(root, controls);
      expect(readControlsFromDom(root)).toEqual(controls);
    });
  }

  it("replaces the whole set rather than merging into it", () => {
    const root = panel();
    const allChanged = Object.fromEntries(
      controlSpec.map((row) => [row.key, otherValue(row)]),
    ) as unknown as Controls;
    writeControlsToDom(root, allChanged);
    writeControlsToDom(root, defaultControls());
    expect(readControlsFromDom(root)).toEqual(defaultControls());
  });

  for (const row of checkboxRows) {
    it(`writes "${row.key}" to the checkbox both ways`, () => {
      const root = panel();
      const checkbox = root.querySelector<HTMLInputElement>(
        `#${row.elementId}`,
      )!;
      writeControlsToDom(root, withControl(row, true));
      expect(checkbox.checked).toBe(true);
      writeControlsToDom(root, withControl(row, false));
      expect(checkbox.checked).toBe(false);
    });
  }
});

describe("readControlsFromDom", () => {
  for (const row of selectRows) {
    it(`falls back to the default when "${row.key}" holds no option`, () => {
      // A `<select>` given a value with no `<option>` reads back as "".
      const root = panel();
      const select = root.querySelector<HTMLSelectElement>(
        `#${row.elementId}`,
      )!;
      select.value = "no-such-option";
      expect(select.value).toBe("");
      expect(readControlsFromDom(root)[row.key]).toBe(row.default);
    });
  }

  it("names the control and the element when one is missing", () => {
    const root = panel();
    root.querySelector("#rotation")!.remove();
    expect(() => readControlsFromDom(root)).toThrow(
      'Control "rot" has no element #rotation',
    );
  });
});

describe("writeControlsToDom", () => {
  // A `<select>` silently ignores a value it has no `<option>` for.
  for (const row of selectRows) {
    it(`throws when "${row.key}"'s dropdown has no option for the value`, () => {
      const root = panel();
      const value = otherValue(row) as string;
      root.querySelector(`#${row.elementId} option[value="${value}"]`)!.remove();
      expect(() => writeControlsToDom(root, withControl(row, value))).toThrow(
        `Control "${row.key}" has no option "${value}"`,
      );
    });
  }

  it("names the control and the element when one is missing", () => {
    const root = panel();
    root.querySelector("#show-grid")!.remove();
    expect(() => writeControlsToDom(root, defaultControls())).toThrow(
      'Control "grid" has no element #show-grid',
    );
  });
});

describe("setControlsLocked", () => {
  it("locks every control but the view-only ones, and unlocks them all", () => {
    const root = panel();
    setControlsLocked(root, true);
    const locked = controlSpec
      .filter((row) => controlElement(root, row).hasAttribute("disabled"))
      .map((row) => row.key);
    expect(locked).toEqual(controlSpec.map((row) => row.key).filter((key) => key !== "rot"));
    setControlsLocked(root, false);
    for (const row of controlSpec) {
      expect(controlElement(root, row).hasAttribute("disabled")).toBe(false);
    }
  });
});

describe("controlElement", () => {
  // Used directly by `static/app.js` to bind its element references.
  it("returns the element every row is bound to", () => {
    const root = panel();
    for (const row of controlSpec) {
      expect(controlElement(root, row).id).toBe(row.elementId);
    }
  });

  it("names the control and the element when one is missing", () => {
    const root = panel();
    const row = controlSpec.find((candidate) => candidate.key === "m")!;
    root.querySelector(`#${row.elementId}`)!.remove();
    expect(() => controlElement(root, row)).toThrow(
      'Control "m" has no element #deployment',
    );
  });
});
