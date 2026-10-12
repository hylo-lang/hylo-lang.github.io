/**
 * The plugin gives a `<Playground>` the files of its program, built from its fences and from the
 * playground it continues, and refuses anything else.
 */
import { mdxToJs, mdxToMdast } from 'satteri';
import { expect, test } from 'vitest';
import { assembleProgram } from '../components/playground/snippet';
import { collectPlaygrounds, playgroundSource } from './playground-source';

/** Returns the code of the playgrounds of `mdx`, a page called `/docs/page.mdx`, in order. */
const playgrounds = (mdx: string) => [
  ...collectPlaygrounds(mdxToMdast(mdx), '/docs/page.mdx').values(),
];

/** Returns the files of the program of each playground of `mdx`, as `{ name: contents }`. */
const programs = (mdx: string) =>
  playgrounds(mdx).map((p) =>
    Object.fromEntries(assembleProgram(p).map((f) => [f.name, f.contents])),
  );

/** Returns a fence of `lang` holding `code`, with `meta`. */
const fence = (code: string, meta = '', lang = 'hylo') => `\`\`\`${lang} ${meta}\n${code}\n\`\`\``;

/** Returns a `<Playground>` with `attributes` wrapping `children`, on lines of their own. */
const playground = (attributes: string, ...children: string[]) =>
  `<Playground ${attributes}>\n${children.join('\n')}\n</Playground>`;

/** Returns `playgrounds`, one after another as paragraphs of a page. */
const page = (...playgrounds: string[]) => playgrounds.join('\n\n');

test('gives a playground the code of its fence, in a file of its own', () => {
  const [p] = playgrounds(playground('expect="ok"', fence('fun f() {}')));
  expect(p).toMatchObject({
    line: 1,
    attributes: { expect: 'ok' },
    files: [{ name: 'main.hylo', contents: '' }],
    shown: [
      { file: 'main.hylo', prelude: '', source: 'fun f() {}', epilogue: '', continuedLines: 0 },
    ],
  });
});

test('keeps the text of attributes written as expressions', () => {
  const [p] = playgrounds(playground('optimization={2} expect="ok"', fence('x')));
  expect(p.attributes).toEqual({ optimization: '2', expect: 'ok' });
});

test('compiles hidden fences before and after the one shown, in order, in the same file', () => {
  const [p] = playgrounds(
    playground(
      'expect="ok"',
      fence('a', 'hidden'),
      fence('b', 'hidden'),
      fence('c', '{1}'),
      fence('d', 'hidden'),
    ),
  );
  expect(p.shown).toMatchObject([{ prelude: 'a\nb', source: 'c', epilogue: 'd' }]);
  expect(assembleProgram(p)).toEqual([{ name: 'main.hylo', contents: 'a\nb\nc\nd' }]);
});

test('puts each fence in the file its title names', () => {
  const [p] = playgrounds(
    playground(
      'expect="ok"',
      fence('p', 'hidden title="point.hylo"'),
      fence('m', 'title="geometry/main.hylo"'),
      fence('q', "hidden title='point.hylo'"),
      fence('own', 'hidden'),
    ),
  );
  expect(p.shown).toMatchObject([{ file: 'geometry/main.hylo', prelude: '', epilogue: '' }]);
  expect(assembleProgram(p)).toEqual([
    { name: 'point.hylo', contents: 'p\nq' },
    { name: 'geometry/main.hylo', contents: 'm' },
    { name: 'main.hylo', contents: 'own' },
  ]);
});

test('starts from the files of the playground continued, continuing the files fences name', () => {
  const [, , third] = playgrounds(
    page(
      playground('name="one" expect="ok"', fence('p1', 'title="point.hylo"'), fence('a', 'hidden')),
      playground('name="two" continues="one" expect="ok"', fence('p2', 'title="point.hylo"')),
      playground(
        'continues="two" expect="ok"',
        fence('p3', 'hidden title="point.hylo"'),
        fence('b'),
      ),
    ),
  );
  expect(assembleProgram(third)).toEqual([
    { name: 'point.hylo', contents: 'p1\np2\np3' },
    { name: 'main.hylo', contents: 'a' },
    { name: 'main2.hylo', contents: 'b' },
  ]);
});

test('gives the code shown in a file continued the code before it as its prelude', () => {
  const [, second] = playgrounds(
    page(
      playground('name="one" expect="ok"', fence('p1', 'title="point.hylo"')),
      playground(
        'continues="one" expect="ok"',
        fence('p2', 'title="point.hylo"'),
        fence('m', 'hidden'),
      ),
    ),
  );
  expect(second.shown).toEqual([
    { file: 'point.hylo', prelude: 'p1', source: 'p2', epilogue: '', continuedLines: 1 },
  ]);
});

test('counts the lines continued apart from the hidden code of the playground itself', () => {
  const [, second] = playgrounds(
    page(
      playground('name="one" expect="ok"', fence('p1\np2', 'title="p.hylo"')),
      playground(
        'continues="one" expect="ok"',
        fence('h', 'hidden title="p.hylo"'),
        fence('s', 'title="p.hylo"'),
      ),
    ),
  );
  expect(second.shown).toMatchObject([{ prelude: 'p1\np2\nh', continuedLines: 2 }]);
});

test('shows a fence of each of several files, as tabs, in the order of the fences', () => {
  const [p] = playgrounds(
    playground(
      'expect="ok"',
      fence('b', 'title="b.hylo"'),
      fence('h', 'hidden title="a.hylo"'),
      fence('a', 'title="a.hylo"'),
      fence('after', 'hidden title="b.hylo"'),
      fence('m'),
    ),
  );
  expect(p.fences.map((f) => f.value)).toEqual(['b', 'a', 'm']);
  expect(p.shown).toEqual([
    { file: 'b.hylo', prelude: '', source: 'b', epilogue: 'after', continuedLines: 0 },
    { file: 'a.hylo', prelude: 'h', source: 'a', epilogue: '', continuedLines: 0 },
    { file: 'main.hylo', prelude: '', source: 'm', epilogue: '', continuedLines: 0 },
  ]);
  expect(assembleProgram(p)).toEqual([
    { name: 'b.hylo', contents: 'b\nafter' },
    { name: 'a.hylo', contents: 'h\na' },
    { name: 'main.hylo', contents: 'm' },
  ]);
});

test("names a playground's own file after every name the program and its titles have", () => {
  const [, second] = programs(
    page(
      playground('name="one" expect="ok"', fence('a')),
      playground(
        'continues="one" expect="ok"',
        fence('b', 'hidden title="main2.hylo"'),
        fence('c'),
      ),
    ),
  );
  expect(second).toEqual({ 'main.hylo': 'a', 'main2.hylo': 'b', 'main3.hylo': 'c' });
});

test('leaves the code of a playground that does not contribute out of those continuing it', () => {
  expect(
    programs(
      page(
        playground('name="one" expect="ok"', fence('a')),
        playground('name="two" continues="one" contributes={false} expect="error"', fence('wrong')),
        playground('continues="two" expect="ok"', fence('b')),
      ),
    ),
  ).toEqual([
    { 'main.hylo': 'a' },
    { 'main.hylo': 'a', 'main2.hylo': 'wrong' },
    { 'main.hylo': 'a', 'main2.hylo': 'b' },
  ]);
});

test('compiles nothing of the playgrounds after one', () => {
  const [first] = programs(
    page(
      playground('name="one" expect="ok"', fence('a', 'title="a.hylo"')),
      playground('continues="one" expect="ok"', fence('b', 'title="a.hylo"')),
    ),
  );
  expect(first).toEqual({ 'a.hylo': 'a' });
});

test('finds playgrounds inside other elements', () => {
  const mdx = `<Aside>\n\n${playground('expect="ok"', fence('x'))}\n\n</Aside>`;
  expect(playgrounds(mdx).map((p) => p.shown[0].source)).toEqual(['x']);
});

test('ignores playgrounds in code blocks, which show the syntax', () => {
  const example = `\`\`\`\`mdx\n${playground('expect="ok"', fence('x'))}\n\`\`\`\``;
  expect(playgrounds(example)).toEqual([]);
});

test.each([
  ['a fence of another language', [fence('a', '', 'rust')], 'wrap only `hylo` code fences'],
  ['a paragraph', ['Some text.'], 'wrap only `hylo` code fences'],
  ['no fence', [], 'show a code fence'],
  ['two fences shown of one file', [fence('a'), fence('b')], 'show one code fence of `main.hylo`'],
  ['only hidden fences', [fence('a', 'hidden')], 'show a code fence'],
  ['a title that is not a file', [fence('a', 'title="Example"')], '`title="Example"` does not name a'],
  ['a title outside the program', [fence('a', 'title="../a.hylo"')], '`title="../a.hylo"` does not'],
])('refuses a playground wrapping %s, naming where it is', (_, children, problem) => {
  expect(() => playgrounds(`\n\n${playground('expect="ok"', ...children)}`)).toThrow(
    `<Playground> in /docs/page.mdx:3: ${problem}`,
  );
});

test.each(['files', 'shown'])(
  'refuses a playground setting `%s` itself',
  (name) => {
    expect(() => playgrounds(playground(`${name}="x" expect="ok"`, fence('a')))).toThrow(
      `\`${name}\` is set from the code fences`,
    );
  },
);

test('refuses a value of `contributes` other than true or false', () => {
  expect(() => playgrounds(playground('contributes={0} expect="ok"', fence('a')))).toThrow(
    'write `contributes={false}`',
  );
});

test('refuses to continue a playground that is not earlier on the page', () => {
  const mdx = page(
    playground('continues="later" expect="ok"', fence('a')),
    playground('name="later" expect="ok"', fence('b')),
  );
  expect(() => playgrounds(mdx)).toThrow(
    '<Playground> in /docs/page.mdx:1: `continues="later"` names no `<Playground>` earlier on the page',
  );
});

test('refuses two playgrounds of the same name', () => {
  const mdx = page(
    playground('name="one" expect="ok"', fence('a')),
    playground('name="one" expect="ok"', fence('b')),
  );
  expect(() => playgrounds(mdx)).toThrow('another `<Playground>` of the page is named `one`');
});

test('refuses a name written as an expression', () => {
  expect(() => playgrounds(playground('name={"one"} expect="ok"', fence('a')))).toThrow(
    'write `name` as a string',
  );
});

test('as a plugin, sets the code as attributes and keeps only the fences shown', async () => {
  const mdx = page(
    playground('name="one" expect="ok"', fence('first', 'title="a.hylo"')),
    playground(
      'continues="one" expect="ok"',
      fence('hiddenBefore', 'hidden'),
      fence('shown'),
      fence('second', 'title="b.hylo"'),
    ),
  );
  const { code } = await mdxToJs(mdx, {
    mdastPlugins: [playgroundSource],
    fileURL: new URL('file:///docs/page.mdx'),
  });
  const files = [
    { name: 'a.hylo', contents: 'first' },
    { name: 'main.hylo', contents: '' },
    { name: 'b.hylo', contents: '' },
  ];
  const shown = [
    { file: 'main.hylo', prelude: 'hiddenBefore', source: 'shown', epilogue: '', continuedLines: 0 },
    { file: 'b.hylo', prelude: '', source: 'second', epilogue: '', continuedLines: 0 },
  ];
  expect(code).toContain(`files: ${JSON.stringify(JSON.stringify(files))}`);
  expect(code).toContain(`shown: ${JSON.stringify(JSON.stringify(shown))}`);
  // The hidden fence is compiled, not shown: it is in `shown`, as a prelude, and nowhere else.
  expect(code.match(/hiddenBefore/g)).toHaveLength(1);
  expect(code.match(/language-hylo/g)).toHaveLength(3);
});
