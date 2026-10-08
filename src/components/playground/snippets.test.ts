/**
 * Every `<Playground>` snippet in the site's content does what its `expect` attribute says, with
 * the compiler the site is built with (see `scripts/fetch-compiler.ts`).
 *
 * The compiler changes under the documentation, and a snippet offering to run code that no longer
 * compiles is worse than a code block that does not offer to.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import type { Phase } from './protocol';
import { parseExpectation, snippetRequest } from './snippet';
import type { Output } from './views';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const compilerDir = path.join(root, 'public/playground/compiler');
const available = existsSync(path.join(compilerDir, 'manifest.json'));

/** A `<Playground>` snippet: where it is, its attributes, and its code fence. */
interface Snippet {
  file: string;
  line: number;
  attributes: Record<string, string>;
  /** The language of the fence, or `undefined` if there is none. */
  language?: string;
  source: string;
}

/**
 * Returns `mdx` without the code blocks other than `hylo` ones and without inline code, where a
 * `<Playground>` is an example of the syntax rather than a snippet. Lines are blanked rather than
 * removed, so that line numbers stay right.
 */
function withoutExamples(mdx: string): string {
  const lines = mdx.split('\n');
  let fence: { ticks: number; blank: boolean } | null = null;
  for (const [i, line] of lines.entries()) {
    const m = /^(`{3,})(.*)$/.exec(line);
    if (fence === null) {
      if (m) fence = { ticks: m[1].length, blank: !/^hylo\b/.test(m[2]) };
      if (fence?.blank) lines[i] = '';
    } else {
      if (fence.blank) lines[i] = '';
      if (m && m[1].length >= fence.ticks && m[2].trim() === '') fence = null;
    }
  }
  return lines.join('\n').replace(/(?<!`)`[^`\n]+`(?!`)/g, '');
}

/** Returns the snippets in the MDX files under `dir`. */
function snippets(dir: string): Snippet[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mdx'))
    .flatMap((e) => {
      const file = path.join(e.parentPath, e.name);
      const text = withoutExamples(readFileSync(file, 'utf8'));
      return [...text.matchAll(/<Playground\b([^>]*)>([\s\S]*?)<\/Playground>/g)].map((m) => {
        const fence = /^\s*```(\S*)[^\n]*\n([\s\S]*?)```\s*$/.exec(m[2]);
        return {
          file: path.relative(root, file),
          line: text.slice(0, m.index).split('\n').length,
          attributes: Object.fromEntries(
            [...m[1].matchAll(/(\w+)=(?:"([^"]*)"|\{([^}]*)\})/g)].map((a) => [a[1], a[2] ?? a[3]]),
          ),
          language: fence?.[1],
          source: fence?.[2] ?? '',
        };
      });
    });
}

const all = snippets(path.join(root, 'src/content'));

test('the site has runnable snippets to check', () => {
  expect(all.length).toBeGreaterThan(0);
});

test.each(all.map((s) => [`${s.file}:${s.line}`, s] as const))('%s is well formed', (_, s) => {
  expect(s.language, 'a snippet wraps exactly one `hylo` code fence').toBe('hylo');
  expect(parseExpectation(s.attributes.expect ?? ''), 'a snippet says what it does').not.toBeNull();
});

describe.skipIf(!available)('snippets, with the compiler in public/playground/compiler', () => {
  // The compiler's loader, as the release ships it.
  let hylo: {
    compile(request: object): {
      diagnostics: { level: string; rendered: string }[];
      error?: string;
      executable?: Uint8Array;
    };
    run(executable: Uint8Array): Promise<{ exitCode: number | null; trap?: string }>;
  };

  beforeAll(async () => {
    const manifest = JSON.parse(readFileSync(path.join(compilerDir, 'manifest.json'), 'utf8'));
    const file = (key: string): Buffer => readFileSync(path.join(compilerDir, manifest.files[key].path));
    const { instantiate } = await import(path.join(compilerDir, 'index.mjs'));
    hylo = await instantiate({
      compiler: await WebAssembly.compile(new Uint8Array(file('compiler'))),
      standardLibrary: JSON.parse(file('standardLibrary').toString('utf8')),
      sysroot: new Map(manifest.sysroot.map((k: string) => [manifest.files[k].name, file(k)])),
    });
  }, 120_000);

  test.each(all.map((s) => [`${s.file}:${s.line}`, s] as const))('%s', async (_, s) => {
    const a = s.attributes;
    const expectation = parseExpectation(a.expect ?? '');
    if (expectation === null) throw new Error(`\`expect="${a.expect}"\` says nothing`);

    // The request the snippet makes in the browser.
    const r = hylo.compile(
      snippetRequest(s.source, {
        outputs: (a.outputs ?? 'result').split(/[\s,]+/).filter((o) => o !== '') as Output[],
        optimization: Number(a.optimization ?? 0),
        standardLibrary: a.standardLibrary !== 'false',
        stopAfter: a.stopAfter as Phase | undefined,
      }),
    );
    expect(r.error).toBeUndefined();
    const errors = r.diagnostics.filter((d) => d.level === 'error').map((d) => d.rendered);
    const run = r.executable ? await hylo.run(r.executable) : null;

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
