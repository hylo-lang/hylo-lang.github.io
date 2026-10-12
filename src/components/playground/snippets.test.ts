/**
 * Every `<Playground>` snippet in the site's content does what its `expect` attribute says, with
 * the compiler the site is built with, `@hylo-lang/hylo-wasm`.
 *
 * The compiler changes under the documentation, and a snippet offering to run code that no longer
 * compiles is worse than a code block that does not offer to.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Compiler, load } from '@hylo-lang/hylo-wasm';
import { mdxToMdast } from 'satteri';
import { beforeAll, describe, expect, test } from 'vitest';
import { collectPlaygrounds, type PlaygroundCode } from '../../plugins/playground-source';
import { parseOptimizationLevel, PHASES } from './settings';
import { assembleProgram, parseExpectation, snippetRequest } from './snippet';
import type { View } from './views';

const root = fileURLToPath(new URL('../../..', import.meta.url));

/** A `<Playground>` snippet: what the site's plugin makes of it, and the page it is in. */
interface Snippet extends PlaygroundCode {
  /** The page it is in, relative to the repository. */
  page: string;
}

/**
 * Returns the snippets in the MDX files under `dir`, read as the site reads them: parsed by
 * Sätteri, and collected by `src/plugins/playground-source.ts`, which throws if one is misused.
 */
function snippets(dir: string): Snippet[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mdx'))
    .flatMap((e) => {
      const file = path.join(e.parentPath, e.name);
      const tree = mdxToMdast(readFileSync(file, 'utf8'));
      const playgrounds = collectPlaygrounds(tree, pathToFileURL(file).pathname);
      return [...playgrounds.values()].map((playground) => ({
        ...playground,
        page: path.relative(root, file),
      }));
    });
}

const all = snippets(path.join(root, 'src/content'));

test('the site has runnable snippets to check', () => {
  expect(all.length).toBeGreaterThan(0);
});

test.each(all.map((s) => [`${s.page}:${s.line}`, s] as const))('%s is well formed', (_, s) => {
  expect(parseExpectation(s.attributes.expect ?? ''), 'a snippet says what it does').not.toBeNull();
});

describe('snippets, with the compiler', () => {
  let compiler: Compiler;
  beforeAll(async () => {
    compiler = await load();
  }, 120_000);

  test.each(all.map((s) => [`${s.page}:${s.line}`, s] as const))('%s', async (_, snippet) => {
    const attributes = snippet.attributes;
    const expectation = parseExpectation(attributes.expect ?? '');
    if (expectation === null) throw new Error(`\`expect="${attributes.expect}"\` says nothing`);

    // The request the snippet makes in the browser.
    const response = compiler.compile(
      snippetRequest(assembleProgram(snippet), {
        views: (attributes.outputs ?? 'result').split(/[\s,]+/).filter((view) => view !== '') as View[],
        optimization: parseOptimizationLevel(attributes.optimization ?? '0'),
        standardLibrary: attributes.standardLibrary !== 'false',
        stopAfter: PHASES.find((phase) => phase === attributes.stopAfter) ?? null,
      }),
    );
    expect(response.error).toBeUndefined();
    const errors = (response.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.level === 'error')
      .map((diagnostic) => diagnostic.rendered);
    const run = response.executable ? await compiler.run(response.executable) : null;

    switch (expectation.kind) {
      case 'error':
        expect(errors, 'expected the snippet not to compile').not.toEqual([]);
        break;
      case 'ok':
        expect(errors).toEqual([]);
        expect(run?.trap).toBeUndefined();
        break;
      case 'trap':
        expect(errors).toEqual([]);
        expect(run?.trap, 'expected the program to trap').toBeDefined();
        break;
      case 'exit':
        expect(errors).toEqual([]);
        expect(run?.exitCode).toBe(expectation.status);
        break;
    }
  });
});
