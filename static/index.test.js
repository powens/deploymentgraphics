// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
// `?raw` rather than `readFileSync`: this file runs under happy-dom, where
// `import.meta.url` is an http URL and cannot be turned back into a path.
import markup from "./index.html?raw";
import { controlSpec } from "../src/viewer-controls.js";

/**
 * The viewer markup's contract with the control spec: element ids and static
 * `<option>` values must match, since nothing else checks `index.html`.
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
    // Both directions: no spec row without an element, and vice versa.
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
      // app.js appends, so a markup option would appear twice.
      expect(optionValues(row)).toEqual([]);
    });
  }
});

describe("the markup's initial state", () => {
  // Only markup-owned controls have an initial state; `start()` fills the rest.
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

describe("the stage before app.js draws", () => {
  const stage = doc.getElementById("stage");

  it("says the map is loading", () => {
    expect(stage.querySelector("#stage-loading")?.textContent).toMatch(/loading/i);
  });

  it("says when JavaScript is off", () => {
    expect(stage.querySelector("noscript")?.textContent).toMatch(/JavaScript/);
  });
});

describe("the boot guard", () => {
  // The page's one inline script, run against a fresh window per test so its
  // listener does not outlive the test.
  const guard = [...doc.querySelectorAll("script:not([src])")]
    .map((script) => script.textContent)
    .join("\n");

  function page() {
    const win = new Window();
    win.document.body.innerHTML = doc.body.innerHTML;
    new Function("window", "document", guard)(win, win.document);
    return win;
  }

  function stageMessage(win) {
    const message = win.document.querySelector("#stage .stage-msg");
    return { text: message.textContent, error: message.classList.contains("error") };
  }

  it("turns the loading message into an error when setup throws", () => {
    const win = page();
    win.dispatchEvent(new win.ErrorEvent("error", { message: "boom" }));
    expect(stageMessage(win)).toEqual({ text: expect.stringContaining("boom"), error: true });
  });

  it("catches a script that fails to load, which does not bubble", () => {
    const win = page();
    const script = win.document.querySelector("script[src]");
    script.dispatchEvent(new win.Event("error"));
    expect(stageMessage(win)).toEqual({ text: expect.stringMatching(/load/), error: true });
  });

  it("keeps the first error", () => {
    const win = page();
    win.dispatchEvent(new win.ErrorEvent("error", { message: "first" }));
    win.dispatchEvent(new win.ErrorEvent("error", { message: "second" }));
    expect(stageMessage(win).text).toContain("first");
  });

  it("leaves the stage alone once app.js has drawn over the message", () => {
    const win = page();
    const card = win.document.createElement("svg");
    win.document.getElementById("stage").replaceChildren(card);
    win.dispatchEvent(new win.ErrorEvent("error", { message: "late" }));
    expect(win.document.getElementById("stage").firstChild).toBe(card);
  });
});

describe("the editor tabs", () => {
  const tabs = [...doc.querySelectorAll("#editor-tabs [role=tab]")];

  it("are the ones app.js binds the keyboard model to", () => {
    expect(tabs.map((tab) => tab.id)).toEqual(["tab-controls", "tab-yaml"]);
  });

  for (const tab of tabs) {
    it(`#${tab.id} controls a tabpanel labelled by it`, () => {
      const tabpanel = doc.getElementById(tab.getAttribute("aria-controls"));
      expect(tabpanel.getAttribute("role")).toBe("tabpanel");
      expect(tabpanel.getAttribute("aria-labelledby")).toBe(tab.id);
    });
  }

  it("start with the selected tab as the only tab stop", () => {
    // Before app.js runs `selectTab`, the markup must already agree with it.
    const state = tabs.map((tab) => [
      tab.getAttribute("aria-selected"),
      tab.getAttribute("tabindex") ?? "0",
    ]);
    expect(state).toEqual([
      ["true", "0"],
      ["false", "-1"],
    ]);
  });
});
