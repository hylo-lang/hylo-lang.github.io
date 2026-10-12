/**
 * The tabs choosing which of a snippet's files is shown, when it shows several, following the
 * WAI-ARIA tabs pattern, as the tabs of views do (`tabs.ts`): one tab in the page's tab order, the
 * arrow keys, Home and End moving between tabs, and a tab selected as soon as it is focused. Each
 * tab has a panel of its own.
 */

/** How many groups of file tabs have been given ids, which numbers the next. */
let groupCount = 0;

/**
 * Makes the `[role="tab"][data-file-tab]` buttons in `tablist` the tabs of `panels`, in order,
 * giving them ids, and returns the function marking a tab, by index, as the selected one.
 *
 * `onSelect` is called with a tab's index when the reader selects it, by clicking it or by moving
 * to it with the keyboard; it should show its panel and mark it as selected with the returned
 * function, which does not call `onSelect`.
 */
export function connectFileTabs(
  tablist: HTMLElement,
  panels: readonly HTMLElement[],
  onSelect: (index: number) => void,
): (index: number) => void {
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"][data-file-tab]')];
  const group = `pg-files-${++groupCount}`;
  for (const [i, tab] of tabs.entries()) {
    tab.id = `${group}-tab-${i}`;
    panels[i].id = `${group}-panel-${i}`;
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('aria-labelledby', tab.id);
    panels[i].removeAttribute('aria-label');
    tab.addEventListener('click', () => onSelect(i));
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
    onSelect(target);
  });

  return (index) => {
    for (const [i, tab] of tabs.entries()) {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    }
  };
}
