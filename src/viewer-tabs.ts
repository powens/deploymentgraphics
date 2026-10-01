/**
 * The viewer's editor-mode tabs, as the WAI-ARIA tabs pattern has them: the
 * tablist is one tab stop (roving tabindex), the arrow keys move between tabs
 * and wrap, Home/End jump to the ends, and selection follows focus. Demo-only
 * (reached via `bundle.ts`).
 */

function tabsOf(tablist: Element): HTMLElement[] {
  return [...tablist.querySelectorAll<HTMLElement>('[role="tab"]')];
}

/**
 * Makes `selected` the tablist's selected tab and its only tab stop, and shows
 * its panel (found by `aria-controls`) alone.
 */
export function selectTab(tablist: Element, selected: Element): void {
  for (const tab of tabsOf(tablist)) {
    const isSelected = tab === selected;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
    const panel = tablist.ownerDocument.getElementById(
      tab.getAttribute("aria-controls") ?? "",
    );
    if (panel) panel.hidden = !isSelected;
  }
}

const ARROW_STEP: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * Moves focus between the tabs from the keyboard and hands `activate` the tab
 * it lands on; `activate` is expected to {@link selectTab} it.
 */
export function bindTabKeys(
  tablist: Element,
  activate: (tab: HTMLElement) => void,
): void {
  tablist.addEventListener("keydown", (event) => {
    const { key } = event as KeyboardEvent;
    const tabs = tabsOf(tablist);
    const current = tabs.indexOf(event.target as HTMLElement);
    if (current === -1) return;
    let next: number;
    if (key === "Home") next = 0;
    else if (key === "End") next = tabs.length - 1;
    else if (key in ARROW_STEP) next = (current + ARROW_STEP[key] + tabs.length) % tabs.length;
    else return;
    event.preventDefault();
    tabs[next].focus();
    activate(tabs[next]);
  });
}
