/**
 * The error preview takes its markup out of a block's text, and draws it instead: squiggles under
 * the code between `~~`, and the message of a `//!` comment after its line.
 */
import { createRenderer } from '@astrojs/starlight/expressive-code';
import { toHtml } from '@expressive-code/core/hast';
import { expect, test } from 'vitest';
import { pluginErrorPreview } from './error-preview-plugin';

/** Returns the text `code`, with `meta`, leaves in its block, and the block's HTML. */
async function render(code: string, meta = 'error-preview') {
  const { ec } = await createRenderer({ plugins: [pluginErrorPreview()], shiki: false });
  const { renderedGroupAst, renderedGroupContents } = await ec.render({ code, language: 'txt', meta });
  return { text: renderedGroupContents[0].codeBlock.code, html: toHtml(renderedGroupAst) };
}

test('takes the markup out of the text, with the spaces before a message', async () => {
  const { text } = await render('let a = ~~b~~ + ~~c~~   //! error: no b\nlet d = 1');
  expect(text).toBe('let a = b + c\nlet d = 1');
});

test('draws the squiggles and the message', async () => {
  const { html } = await render('let a = ~~b~~ //! error: no b');
  expect(html).toMatch(/<span class="error-squiggles">(<[^>]*>)*b/);
  expect(html).toContain('<span class="error-message">error: no b</span>');
});

test('leaves a block without `error-preview` alone', async () => {
  const { text, html } = await render('let a = ~~b~~ //! error: no b', '');
  expect(text).toBe('let a = ~~b~~ //! error: no b');
  expect(html).not.toContain('error-message');
});

test('only reads `//!` as a message after a space or at the start of a line', async () => {
  const { text } = await render('//! error: here\nlet url = "a//!b"');
  expect(text).toBe('\nlet url = "a//!b"');
});
