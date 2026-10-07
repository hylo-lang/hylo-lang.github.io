/**
 * Every `<Playground>` snippet in the site's content does what its `expect` attribute says, with
 * the compiler the site is built with (see `scripts/fetch-compiler.ts`).
 *
 * The compiler changes under the documentation, and a snippet offering to run code that no longer
 * compiles is worse than a code block that does not offer to.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const root = new URL('../../..', import.meta.url).pathname;
const compilerDir = path.join(root, 'public/playground/compiler');
const available = existsSync(path.join(compilerDir, 'manifest.json'));

/** A `<Playground>` snippet: where it is, its attributes, and its code. */
interface Snippet {
  file: string;
  line: number;
  attributes: Record<string, string>;
  source: string;
}

/** Returns the snippets in the MDX files under `dir`. */
function snippets(dir: string): Snippet[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mdx'))
    .flatMap((e) => {
      const file = path.join(e.parentPath, e.name);
      // A `<Playground>` inside a longer fence is an example of the syntax, not a snippet. Such
      // fences are blanked out, keeping their lines so that line numbers stay right.
      const text = readFileSync(file, 'utf8').replace(/^(`{4,})[^\n]*\n[\s\S]*?^\1\s*$/gm, (f) =>
        f.replace(/[^\n]/g, ''),
      );
      return [...text.matchAll(/<Playground\b([^>]*)>\s*```hylo[^\n]*\n([\s\S]*?)```\s*<\/Playground>/g)].map(
        (m) => ({
          file: path.relative(root, file),
          line: text.slice(0, m.index).split('\n').length,
          attributes: Object.fromEntries(
            [...m[1].matchAll(/(\w+)=(?:"([^"]*)"|\{([^}]*)\})/g)].map((a) => [a[1], a[2] ?? a[3]]),
          ),
          source: m[2],
        }),
      );
    });
}

const all = snippets(path.join(root, 'src/content'));

test('the site has runnable snippets to check', () => {
  expect(all.length).toBeGreaterThan(0);
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
    expect(a.expect, 'a snippet must say what it does with `expect`').toBeDefined();
    const r = hylo.compile({
      source: s.source,
      emit: a.stopAfter ? [] : ['executable'],
      optimization: Number(a.optimization ?? 0),
      standardLibrary: a.standardLibrary !== 'false',
      stopAfter: a.stopAfter,
    });
    expect(r.error).toBeUndefined();
    const errors = r.diagnostics.filter((d) => d.level === 'error').map((d) => d.rendered);
    const run = r.executable ? await hylo.run(r.executable) : null;

    const [kind, value] = a.expect.split(/\s+/);
    switch (kind) {
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
        expect(run?.exitCode).toBe(Number(value));
        break;
      default:
        throw new Error(`unknown expectation '${a.expect}'`);
    }
  });
});
