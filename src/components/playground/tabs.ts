/**
 * The tabs choosing which view of a compilation a playground shows, following the WAI-ARIA tabs
 * pattern: one tab in the page's tab order, the arrow keys, Home and End moving between tabs, and
 * a tab selected as soon as it is focused.
 */
import type { Output } from './views';

let panels = 0;

/**
 * Makes the `[role="tab"][data-output]` buttons in `tablist` control `panel`, calling `onSelect`
 * when the reader selects one, and returns the function marking `output` as the selected tab.
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
