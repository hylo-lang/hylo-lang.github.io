/**
 * The markup of an error preview (see `error-preview-plugin.ts`): `~~code~~` squiggles `code`, and
 * a `//! message` comment shows `message` at the end of its line. Kept apart from the plugin, which
 * depends on Expressive Code, so that the browser can take the markup out of code too.
 */

/** Matches a `//!` comment surrounded by spaces, with the spaces before it, capturing its text. */
export const MESSAGE = /(?:^|\s+)\/\/!\s(.*)$/;

/** Matches the code between `~~` and `~~`, capturing it. */
export const SQUIGGLES = /~~([^~]+)~~/g;

/** Returns `code` without its error preview's markup: the code the preview shows. */
export const withoutErrorPreview = (code: string): string =>
  code
    .split('\n')
    .map((line) => line.replace(MESSAGE, '').replace(SQUIGGLES, '$1'))
    .join('\n');
