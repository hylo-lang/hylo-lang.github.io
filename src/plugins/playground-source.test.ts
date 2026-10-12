/**
 * The plugin gives a `<Playground>` the code of the fence it shows and of those it hides, with
 * the code of the playground it continues, and refuses anything else.
 */
import { mdxToJs, mdxToMdast } from 'satteri';
import { expect, test } from 'vitest';
import { collectPlaygrounds, playgroundSource } from './playground-source';

/** Returns the code of the playgrounds of `mdx`, a page called `/docs/page.mdx`, in order. */
const playgrounds = (mdx: string) => [
  ...collectPlaygrounds(mdxToMdast(mdx), '/docs/page.mdx').values(),
];

/** Returns a fence of `lang` holding `code`, with `meta`. */
const fence = (code: string, meta = '', lang = 'hylo') => `\`\`\`${lang} ${meta}\n${code}\n\`\`\``;

/** Returns a `<Playground>` with `attributes` wrapping `children`, on lines of their own. */
const playground = (attributes: string, ...children: string[]) =>
  `<Playground ${attributes}>\n${children.join('\n')}\n</Playground>`;

test('gives a playground the code of its fence', () => {
  const [p] = playgrounds(playground('expect="ok"', fence('fun f() {}')));
  expect(p).toMatchObject({
    line: 1,
    attributes: { expect: 'ok' },
    prelude: '',
    source: 'fun f() {}',
    epilogue: '',
  });
});

test('keeps the text of attributes written as expressions', () => {
  const [p] = playgrounds(playground('optimization={2} expect="ok"', fence('x')));
  expect(p.attributes).toEqual({ optimization: '2', expect: 'ok' });
});

test('compiles hidden fences before and after the one shown, in order', () => {
  const [p] = playgrounds(
    playground(
      'expect="ok"',
      fence('a', 'hidden'),
      fence('b', 'title="b.hylo" hidden'),
      fence('c', '{1}'),
      fence('d', 'hidden'),
    ),
  );
  expect(p).toMatchObject({ prelude: 'a\nb', source: 'c', epilogue: 'd' });
});

test('compiles the whole of the playground continued before the code of one continuing it', () => {
  const [, , third] = playgrounds(
    [
      playground('name="one" expect="ok"', fence('a', 'hidden'), fence('b'), fence('c', 'hidden')),
      playground('name="two" continues="one" expect="ok"', fence('d')),
      playground('continues="two" expect="ok"', fence('e', 'hidden'), fence('f')),
    ].join('\n\n'),
  );
  expect(third).toMatchObject({ prelude: 'a\nb\nc\nd\ne', source: 'f', epilogue: '' });
});

test('finds playgrounds inside other elements', () => {
  const mdx = `<Aside>\n\n${playground('expect="ok"', fence('x'))}\n\n</Aside>`;
  expect(playgrounds(mdx).map((p) => p.source)).toEqual(['x']);
});

test('ignores playgrounds in code blocks, which show the syntax', () => {
  const example = `\`\`\`\`mdx\n${playground('expect="ok"', fence('x'))}\n\`\`\`\``;
  expect(playgrounds(example)).toEqual([]);
});

test.each([
  ['a fence of another language', [fence('a', '', 'rust')], 'wrap only `hylo` code fences'],
  ['a paragraph', ['Some text.'], 'wrap only `hylo` code fences'],
  ['no fence', [], 'show exactly one code fence'],
  ['two fences shown', [fence('a'), fence('b')], 'show exactly one code fence'],
  ['only hidden fences', [fence('a', 'hidden')], 'show exactly one code fence'],
])('refuses a playground wrapping %s, naming where it is', (_, children, problem) => {
  expect(() => playgrounds(`\n\n${playground('expect="ok"', ...children)}`)).toThrow(
    `<Playground> in /docs/page.mdx:3: ${problem}`,
  );
});

test.each(['source', 'prelude', 'epilogue'])('refuses a playground setting `%s` itself', (name) => {
  expect(() => playgrounds(playground(`${name}="x" expect="ok"`, fence('a')))).toThrow(
    `\`${name}\` is set from the code fences`,
  );
});

test('refuses to continue a playground that is not earlier on the page', () => {
  const mdx = [
    playground('continues="later" expect="ok"', fence('a')),
    playground('name="later" expect="ok"', fence('b')),
  ].join('\n\n');
  expect(() => playgrounds(mdx)).toThrow(
    '<Playground> in /docs/page.mdx:1: `continues="later"` names no `<Playground>` earlier on the page',
  );
});

test('refuses two playgrounds of the same name', () => {
  const mdx = [
    playground('name="one" expect="ok"', fence('a')),
    playground('name="one" expect="ok"', fence('b')),
  ].join('\n\n');
  expect(() => playgrounds(mdx)).toThrow('another `<Playground>` of the page is named `one`');
});

test('refuses a name written as an expression', () => {
  expect(() => playgrounds(playground('name={"one"} expect="ok"', fence('a')))).toThrow(
    'write `name` as a string',
  );
});

test('as a plugin, sets the code as attributes and keeps only the fence shown', async () => {
  const mdx = [
    playground('name="one" expect="ok"', fence('first')),
    playground('continues="one" expect="ok"', fence('hiddenBefore', 'hidden'), fence('shown')),
  ].join('\n\n');
  const { code } = await mdxToJs(mdx, {
    mdastPlugins: [playgroundSource],
    fileURL: new URL('file:///docs/page.mdx'),
  });
  expect(code).toContain('prelude: "first\\nhiddenBefore"');
  expect(code).toContain('source: "shown"');
  // The hidden fence is compiled, not shown.
  expect(code.match(/hiddenBefore/g)).toHaveLength(1);
});
