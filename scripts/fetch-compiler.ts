/**
 * Puts the Hylo compiler compiled to WebAssembly, which runs the site's playgrounds, in
 * `public/playground/compiler/`. Run before every build by `.github/workflows/ci.yml` and
 * `.github/workflows/astro.yml`, after `scripts/write-release-tag.ts`.
 *
 * The compiler comes from the release the site is built against (`src/release-tag.ts`), whose
 * `hylo-<tag>-wasm32-wasip1.tar.zst` archive hylo-new's release workflow builds. When
 * `HYLO_WASM_DIR` names a directory, the release packaged there (by hylo-new's
 * `Tools/wasm/js/package-release.mjs`) is used instead, for working on both at once.
 *
 * Every file is checked against the digest the release's `manifest.json` records.
 *
 * A site built without a compiler still works: its snippets read as code blocks, and running one
 * says the compiler is not available. So when the release has no compiler, this warns and
 * succeeds.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tag, wasmDownloadUrl } from '../src/release.ts';
import { fetchFromGitHub } from './github.ts';

const TARGET = fileURLToPath(new URL('../public/playground/compiler/', import.meta.url));

/** The parts of a release's `manifest.json` this script relies on. */
interface Manifest {
  schemaVersion: number;
  version: string;
  files: Record<string, { path: string; sha256: string }>;
  loaders: Record<string, { sha256: string }>;
}

/** Exits, saying `problem`. */
function fail(problem: string): never {
  console.error(problem);
  process.exit(1);
}

/** Exits successfully without a compiler, saying why, in a way GitHub Actions shows. */
function skip(reason: string): never {
  console.warn(`::warning::${reason} The site is built without a playground compiler.`);
  process.exit(0);
}

/** Copies the release in `dir` to the target directory, checking every file it names. */
function install(dir: string): Manifest {
  const manifestBytes = readFileSync(path.join(dir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Manifest;
  if (manifest.schemaVersion !== 1 || typeof manifest.files !== 'object' || !manifest.loaders) {
    fail(`Unsupported compiler manifest (schema version ${manifest.schemaVersion}).`);
  }
  if (!manifest.loaders['worker.mjs']) fail('The compiler release has no worker.mjs.');

  const files = [
    ...Object.values(manifest.files).map((f) => [f.path, f.sha256] as const),
    ...Object.entries(manifest.loaders).map(([name, f]) => [name, f.sha256] as const),
  ];
  for (const [name, sha256] of files) {
    // A release is flat; a name reaching elsewhere is not one this script will write.
    if (path.basename(name) !== name || name.startsWith('.')) fail(`Unexpected file name ${name}.`);
    const bytes = readFileSync(path.join(dir, name));
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
      fail(`${name} does not match the digest in the manifest.`);
    }
    writeFileSync(path.join(TARGET, name), bytes);
  }
  writeFileSync(path.join(TARGET, 'manifest.json'), manifestBytes);
  return manifest;
}

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });

let manifest: Manifest;
const local = process.env.HYLO_WASM_DIR;
if (local) {
  manifest = install(local);
} else {
  if (tag === 'v0.0.0-dev') skip('src/release-tag.ts holds its placeholder; run scripts/write-release-tag.ts.');
  const url = wasmDownloadUrl(tag);
  const response = await fetchFromGitHub(url, { timeout: 300_000, allow: [404] });
  if (response.status === 404) skip(`${tag} has no compiler compiled to WebAssembly (${url}).`);

  const scratch = mkdtempSync(path.join(tmpdir(), 'hylo-wasm-'));
  try {
    const archive = path.join(scratch, 'release.tar.zst');
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    const unpacked = path.join(scratch, 'release');
    mkdirSync(unpacked);
    execFileSync('tar', ['--zstd', '-xf', archive, '-C', unpacked], { stdio: 'inherit' });
    manifest = install(unpacked);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

console.log(`Playground compiler ${manifest.version} in ${path.relative(process.cwd(), TARGET)}`);
