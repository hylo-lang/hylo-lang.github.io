/**
 * The compiler the site is built with (see `scripts/fetch-compiler.ts`), for the tests that check
 * the site's content against it.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { CompileRequest, Compilation, Execution } from './protocol';

/** Where `scripts/fetch-compiler.ts` installs the compiler's release. */
const compilerDir = fileURLToPath(new URL('../../../public/playground/compiler', import.meta.url));

/** `true` iff a compiler was fetched, without which the tests using it are skipped. */
export const compilerAvailable = existsSync(path.join(compilerDir, 'manifest.json'));

/** The compiler, as the loader the release ships hands it out. */
export interface TestCompiler {
  compile(request: CompileRequest): Compilation & { executable?: Uint8Array };
  run(executable: Uint8Array): Promise<Execution>;
}

/** Returns the fetched compiler, instantiated from the release's files. */
export async function instantiateCompiler(): Promise<TestCompiler> {
  const manifest = JSON.parse(readFileSync(path.join(compilerDir, 'manifest.json'), 'utf8'));
  const file = (key: string): Buffer => {
    const f = manifest.files[key];
    const bytes = readFileSync(path.join(compilerDir, f.path));
    return f.encoding === 'gzip' ? gunzipSync(bytes) : bytes;
  };
  const { instantiate } = await import(path.join(compilerDir, 'index.mjs'));
  return instantiate({
    compiler: await WebAssembly.compile(new Uint8Array(file('compiler'))),
    standardLibrary: JSON.parse(file('standardLibrary').toString('utf8')),
    sysroot: new Map(manifest.sysroot.map((k: string) => [manifest.files[k].name, file(k)])),
  });
}
