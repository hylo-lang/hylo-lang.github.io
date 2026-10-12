/** The plugin gives an `<Example>` the MDX it wraps, exactly as written, and refuses an empty one. */
import { mdxToJs } from 'satteri';
import { expect, test } from 'vitest';
import { exampleSource } from './example-source';

/** Returns the JavaScript the plugin makes of `mdx`, a page called `/docs/page.mdx`. */
const compile = async (mdx: string) =>
  (
    await mdxToJs(mdx, {
      mdastPlugins: [exampleSource],
      fileURL: new URL('file:///docs/page.mdx'),
    })
  ).code;

test('gives an example the MDX it wraps, from its first child to its last', async () => {
  const wrapped = '<Playground expect="ok">\n```hylo\n// … é 🦎\nfun f() {}\n```\n</Playground>\n\nSome *text*.';
  const code = await compile(`Ünïcödé before.\n\n<Example>\n${wrapped}\n</Example>\n`);
  expect(code).toContain(`source: ${JSON.stringify(wrapped)}`);
});

test('leaves other elements alone', async () => {
  expect(await compile('<Aside>\nText.\n</Aside>\n')).not.toContain('source:');
});

test('refuses an example wrapping nothing, naming where it is', async () => {
  await expect(compile('\n\n<Example>\n</Example>\n')).rejects.toThrow(
    '<Example> in /docs/page.mdx:3: wrap what to show',
  );
});

test('refuses an example setting its source itself', async () => {
  await expect(compile('<Example source="x">\nText.\n</Example>\n')).rejects.toThrow(
    '`source` is set from its contents',
  );
});
