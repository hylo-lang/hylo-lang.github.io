/**
 * The plugin gives a `<Playground>` the code of its one `hylo` fence, and refuses anything else.
 */
import { expect, test } from 'vitest';
import { playgroundSource } from './playground-source';

type Visitor = (node: unknown, context: unknown) => unknown;
const visit = (playgroundSource as unknown as { mdxJsxFlowElement: Visitor }).mdxJsxFlowElement;
const context = { fileURL: new URL('file:///docs/page.mdx') };

/** Returns a `<name>` element with `attributes` wrapping `children`, at line 7. */
const element = (name: string, children: unknown[], attributes: unknown[] = []) => ({
  type: 'mdxJsxFlowElement',
  name,
  attributes,
  children,
  position: { start: { line: 7, column: 1 } },
});
const fence = (lang: string, value: string) => ({ type: 'code', lang, value });

test('gives a playground the code of its fence', () => {
  const expect_ = { type: 'mdxJsxAttribute', name: 'expect', value: 'ok' };
  const result = visit(element('Playground', [fence('hylo', 'fun f() {}')], [expect_]), context);
  expect(result).toMatchObject({
    attributes: [expect_, { type: 'mdxJsxAttribute', name: 'source', value: 'fun f() {}' }],
    children: [fence('hylo', 'fun f() {}')],
  });
});

test('leaves other elements alone', () => {
  expect(visit(element('Aside', [fence('hylo', 'x')]), context)).toBeUndefined();
});

test.each([
  ['two fences', [fence('hylo', 'a'), fence('hylo', 'b')]],
  ['a fence of another language', [fence('rust', 'a')]],
  ['no fence', []],
  ['a paragraph', [{ type: 'paragraph', children: [] }]],
])('refuses a playground wrapping %s, naming where it is', (_, children) => {
  expect(() => visit(element('Playground', children), context)).toThrow(
    '<Playground> in /docs/page.mdx:7: wrap exactly one `hylo` code fence',
  );
});

test('refuses a playground setting its source itself', () => {
  const source = { type: 'mdxJsxAttribute', name: 'source', value: 'x' };
  expect(() => visit(element('Playground', [fence('hylo', 'a')], [source]), context)).toThrow(
    '`source` is set from the code fence',
  );
});
