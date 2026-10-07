/**
 * Puts the Hylo compiler compiled to WebAssembly, which runs the site's playgrounds, in
 * `public/playground/compiler/`. Run before every build by `.github/workflows/ci.yml` and
 * `.github/workflows/astro.yml`.
 *
 * The compiler is the newest `wasm-v*` release of hylo-new (built by its
 * `.github/workflows/wasm-compiler.yml`), or, when `HYLO_WASM_DIR` names one, a release packaged
 * locally (by `Tools/wasm/js/package-release.mjs` there), for working on both at once.
 *
 * Every file but `manifest.json` is checked against the digest the manifest records.
 *
 * A site built without a compiler still works: its snippets read as code blocks, and running one
 * says the compiler is not available. So when no release exists yet, this says so and succeeds.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TARGET = new URL('../public/playground/compiler/', import.meta.url).pathname;
const REPOSITORY = process.env.HYLO_WASM_REPO ?? 'hylo-lang/hylo-new';

/** The parts of a release's `manifest.json` this script relies on. */
interface Manifest {
  schemaVersion: number;
  version: string;
  files: Record<string, { path: string; sha256: string }>;
}

/** The files a release serves besides those its manifest lists. */
const LOADER_FILES = ['index.mjs', 'worker.mjs'];

/** Returns the bytes at `url`, or exits if they cannot be fetched. */
async function fetchBytes(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    console.error(`${url} returned ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Returns the manifest in `bytes`, or exits if it is not one this script understands. */
function parseManifest(bytes: Buffer): Manifest {
  const m = JSON.parse(bytes.toString('utf8')) as Manifest;
  if (m.schemaVersion !== 1 || typeof m.files !== 'object') {
    console.error(`Unsupported compiler manifest (schema version ${m.schemaVersion}).`);
    process.exit(1);
  }
  return m;
}

/** Writes `bytes` as `name` in the target directory, checking them against `sha256` if given. */
function install(name: string, bytes: Buffer, sha256?: string): void {
  if (sha256 && createHash('sha256').update(bytes).digest('hex') !== sha256) {
    console.error(`${name} does not match the digest in the manifest.`);
    process.exit(1);
  }
  writeFileSync(path.join(TARGET, name), bytes);
}

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });

const local = process.env.HYLO_WASM_DIR;
let manifest: Manifest;
if (local) {
  manifest = parseManifest(readFileSync(path.join(local, 'manifest.json')));
  for (const f of Object.values(manifest.files)) {
    install(f.path, readFileSync(path.join(local, f.path)), f.sha256);
  }
  for (const name of LOADER_FILES) copyFileSync(path.join(local, name), path.join(TARGET, name));
  copyFileSync(path.join(local, 'manifest.json'), path.join(TARGET, 'manifest.json'));
} else {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  // Raises GitHub's unauthenticated rate limit, which is shared across CI egress IPs.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const releases = JSON.parse(
    (await fetchBytes(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=50`, headers)).toString(),
  ) as { tag_name: string; draft: boolean; assets: { name: string; browser_download_url: string }[] }[];
  const release = releases.find(
    (r) => !r.draft && r.tag_name.startsWith('wasm-v') && r.assets.some((a) => a.name === 'manifest.json'),
  );
  if (!release) {
    console.warn(`${REPOSITORY} has no wasm-v* release yet: building without a playground compiler.`);
    process.exit(0);
  }
  const asset = (name: string): string => {
    const a = release.assets.find((x) => x.name === name);
    if (!a) {
      console.error(`${release.tag_name} has no ${name}.`);
      process.exit(1);
    }
    return a.browser_download_url;
  };
  const manifestBytes = await fetchBytes(asset('manifest.json'));
  manifest = parseManifest(manifestBytes);
  for (const f of Object.values(manifest.files)) install(f.path, await fetchBytes(asset(f.path)), f.sha256);
  for (const name of LOADER_FILES) install(name, await fetchBytes(asset(name)));
  install('manifest.json', manifestBytes);
}

if (!existsSync(path.join(TARGET, 'worker.mjs'))) {
  console.error('The compiler release has no worker.mjs.');
  process.exit(1);
}
console.log(`Playground compiler ${manifest.version} in ${path.relative(process.cwd(), TARGET)}`);
