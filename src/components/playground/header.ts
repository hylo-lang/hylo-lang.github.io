/**
 * Keeps the full-screen playground's header (`src/pages/playground.astro`) on one line: as the
 * window narrows, the header's `[data-collapse]` items leave it, the lowest `data-collapse` first,
 * until the rest fits; as it widens, they come back. An item with `data-collapse-hide` is hidden
 * but for screen readers (`pg-visually-hidden`); any other moves into the "More options" menu:
 * into the row of links at its foot (`#pg-collapsed-links`) if its `data-collapse-to` is
 * `links`, and above its own settings (`#pg-collapsed`) otherwise, keeping in either the order it
 * has in the header.
 *
 * Items are moved, not copied, so that controls keep their state and their listeners.
 */

/** The header. */
const header = document.querySelector<HTMLElement>('header.bar')!;
/** Where the items moved out of the header go, in the "More options" menu. */
const destinations = {
  controls: document.getElementById('pg-collapsed')!,
  links: document.getElementById('pg-collapsed-links')!,
};

/** An item that can leave the header, and where it goes back to. */
interface CollapsibleItem {
  element: HTMLElement;
  /** Whether it is hidden rather than moved. */
  hide: boolean;
  /** Where it goes in the menu, unless it is hidden. */
  destination: HTMLElement;
  /** Marks its place in the header. */
  placeholder: Comment;
}

/** The items, the first to leave first. */
const items: CollapsibleItem[] = [...header.querySelectorAll<HTMLElement>('[data-collapse]')]
  .sort((a, b) => Number(a.dataset.collapse) - Number(b.dataset.collapse))
  .map((element) => {
    const placeholder = document.createComment('');
    element.before(placeholder);
    return {
      element,
      hide: element.hasAttribute('data-collapse-hide'),
      destination:
        element.dataset.collapseTo === 'links' ? destinations.links : destinations.controls,
      placeholder,
    };
  });

/** Returns `true` iff the header's contents are wider than the header. */
const headerOverflows = (): boolean => header.scrollWidth > header.clientWidth;

/** Takes items out of the header, from the first, until it no longer overflows. */
function fitHeaderOnOneLine(): void {
  // Every item back in place, in the header's order...
  for (const { element, hide, placeholder } of items) {
    if (hide) element.classList.remove('pg-visually-hidden');
    else placeholder.after(element);
  }
  // ...then out, until the rest fits.
  const moved: CollapsibleItem[] = [];
  for (const item of items) {
    if (!headerOverflows()) break;
    if (item.hide) {
      item.element.classList.add('pg-visually-hidden');
    } else {
      item.destination.append(item.element);
      moved.push(item);
    }
  }
  // In the menu, in the header's order.
  moved.sort((a, b) =>
    a.placeholder.compareDocumentPosition(b.placeholder) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1,
  );
  for (const item of moved) item.destination.append(item.element);
  for (const destination of Object.values(destinations)) {
    destination.hidden = destination.childElementCount === 0;
  }
}

new ResizeObserver(fitHeaderOnOneLine).observe(header);
// The fonts change how wide the items are.
void document.fonts.ready.then(fitHeaderOnOneLine);
