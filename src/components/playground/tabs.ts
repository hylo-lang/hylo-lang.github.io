/**
 * The tabs choosing which view of a compilation a playground shows, following the WAI-ARIA tabs
 * pattern: one tab in the page's tab order, the arrow keys, Home and End moving between tabs, and
 * a tab selected as soon as it is focused.
 */
import type { Output } from './views';

/** How many panels have been given an id, which numbers the next. */
let panels = 0;

/**
 * Makes the `[role="tab"][data-output]` buttons in `tablist` the tabs of `panel`, giving `panel`
 * and the tabs ids if they have none, and returns the function marking the tab of an output as the
 * selected one.
 *
 * `onSelect` is called with a tab's `data-output` when the reader selects it, by clicking it or by
 * moving to it with the keyboard; it should show that output in `panel` and mark the tab as
 * selected with the returned function, which does not call `onSelect`. Until it is first called,
 * no tab is selected.
 */
export function connectTabs(
  tablist: HTMLElement,
  panel: HTMLElement,
  onSelect: (output: Output) => void,
): (output: Output) => void {
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"][data-output]')];
  panel.id ||= `pg-panel-${++panels}`;
  panel.setAttribute('role', 'tabpanel');
  for (const [i, tab] of tabs.entries()) {
    tab.id ||= `${panel.id}-tab-${i}`;
    tab.setAttribute('aria-controls', panel.id);
    tab.addEventListener('click', () => onSelect(tab.dataset.output as Output));
  }

  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const j =
      e.key === 'ArrowRight' ? (i + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (j < 0) return;
    e.preventDefault();
    tabs[j].focus();
    onSelect(tabs[j].dataset.output as Output);
  });

  return (output) => {
    for (const tab of tabs) {
      const selected = tab.dataset.output === output;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) panel.setAttribute('aria-labelledby', tab.id);
    }
  };
}
