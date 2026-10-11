/**
 * The tabs choosing which view a playground's panel shows, following the WAI-ARIA tabs pattern:
 * one tab in the page's tab order, the arrow keys, Home and End moving between tabs, and a tab
 * selected as soon as it is focused.
 */
import type { View } from './views';

/** How many panels have been given an id, which numbers the next. */
let panelCount = 0;

/**
 * Makes the `[role="tab"][data-view]` buttons in `tablist` the tabs of `panel`, giving `panel`
 * and the tabs ids if they have none, and returns the function marking the tab of a view as the
 * selected one.
 *
 * `onSelect` is called with a tab's `data-view` when the reader selects it, by clicking it or by
 * moving to it with the keyboard; it should show that view in `panel` and mark the tab as
 * selected with the returned function, which does not call `onSelect`. Until it is first called,
 * no tab is selected.
 */
export function connectTabs(
  tablist: HTMLElement,
  panel: HTMLElement,
  onSelect: (view: View) => void,
): (view: View) => void {
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"][data-view]')];
  panel.id ||= `pg-panel-${++panelCount}`;
  panel.setAttribute('role', 'tabpanel');
  for (const [i, tab] of tabs.entries()) {
    tab.id ||= `${panel.id}-tab-${i}`;
    tab.setAttribute('aria-controls', panel.id);
    tab.addEventListener('click', () => onSelect(tab.dataset.view as View));
  }

  tablist.addEventListener('keydown', (event) => {
    const focused = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (focused < 0) return;
    const target =
      event.key === 'ArrowRight' ? (focused + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (focused + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : -1;
    if (target < 0) return;
    event.preventDefault();
    tabs[target].focus();
    onSelect(tabs[target].dataset.view as View);
  });

  return (view) => {
    for (const tab of tabs) {
      const selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) panel.setAttribute('aria-labelledby', tab.id);
    }
  };
}
