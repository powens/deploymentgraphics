// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { bindTabKeys, selectTab } from "./viewer-tabs.js";

/** A tablist of three tabs, each controlling its own panel, all attached. */
function tablist(): HTMLElement {
  document.body.replaceChildren();
  const list = document.createElement("div");
  list.setAttribute("role", "tablist");
  for (const name of ["one", "two", "three"]) {
    const tab = document.createElement("button");
    tab.id = `tab-${name}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${name}`);
    list.appendChild(tab);
    const panel = document.createElement("section");
    panel.id = `panel-${name}`;
    panel.setAttribute("role", "tabpanel");
    document.body.appendChild(panel);
  }
  document.body.prepend(list);
  return list;
}

function tabs(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
}

describe("selectTab", () => {
  let list: HTMLElement;
  beforeEach(() => {
    list = tablist();
    selectTab(list, tabs(list)[1]);
  });

  it("marks only the given tab selected", () => {
    expect(tabs(list).map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("leaves the selected tab the tablist's only tab stop", () => {
    expect(tabs(list).map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("shows only the selected tab's panel", () => {
    const hidden = ["one", "two", "three"].map(
      (name) => document.getElementById(`panel-${name}`)!.hidden,
    );
    expect(hidden).toEqual([true, false, true]);
  });
});

describe("bindTabKeys", () => {
  let list: HTMLElement;
  let activated: string[];
  beforeEach(() => {
    list = tablist();
    activated = [];
    selectTab(list, tabs(list)[0]);
    bindTabKeys(list, (tab) => {
      activated.push(tab.id);
      selectTab(list, tab);
    });
  });

  function press(from: number, key: string, init: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    tabs(list)[from].dispatchEvent(event);
    return event;
  }

  for (const [from, key, to] of [
    [0, "ArrowRight", "tab-two"],
    [2, "ArrowRight", "tab-one"],
    [1, "ArrowLeft", "tab-one"],
    [0, "ArrowLeft", "tab-three"],
    [1, "Home", "tab-one"],
    [0, "End", "tab-three"],
  ] as const) {
    it(`${key} from tab ${from} focuses and activates ${to}`, () => {
      const event = press(from, key);
      expect(activated).toEqual([to]);
      expect(document.activeElement?.id).toBe(to);
      expect(event.defaultPrevented).toBe(true);
    });
  }

  it("moves the tab stop with the selection", () => {
    press(0, "ArrowRight");
    expect(tabs(list).map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  });

  for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
    it(`leaves ${modifier} shortcuts to the browser`, () => {
      const event = press(1, "ArrowLeft", { [modifier]: true });
      expect(activated).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });
  }

  it("leaves other keys to the browser", () => {
    const event = press(0, "Enter");
    expect(activated).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });
});
