import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import {
  assetName,
  downloadCommand,
  expectedAssets,
  parseLatestTag,
  POSIX_INSTALL_DIR,
  releaseProblem,
  tag,
  WINDOWS_INSTALL_DIR,
} from './release.ts';

/** A complete asset list for `tag`, as the releases API would report it. */
function complete(tag: string) {
  return expectedAssets(tag).map((name) => ({ name }));
}

describe('assetName', () => {
  it('spells the published archive names', () => {
    expect(assetName('v0.0.9', 'linux', 'x64')).toBe('hylo-v0.0.9-linux-x64.tar.zst');
    expect(expectedAssets('v0.0.9')).toHaveLength(6);
  });
});

describe('downloadCommand', () => {
  it('downloads and unpacks the archive on a POSIX platform', () => {
    expect(downloadCommand('v1.2.3', 'linux', 'arm64')).toBe(
      'curl -LO https://github.com/hylo-lang/hylo-new/releases/download/v1.2.3/hylo-v1.2.3-linux-arm64.tar.zst\n' +
        'mkdir -p "$HOME/.local/hylo" && ' +
        'tar --zstd -xf hylo-v1.2.3-linux-arm64.tar.zst -C "$HOME/.local/hylo"',
    );
  });

  it('uses curl.exe and LOCALAPPDATA on Windows', () => {
    const command = downloadCommand('v1.2.3', 'windows', 'x64');
    // `curl` is a PowerShell alias for Invoke-WebRequest, which takes no -LO.
    expect(command).toContain('curl.exe -LO ');
    expect(command).toContain('"$env:LOCALAPPDATA\\Hylo"');
  });
});

describe('releaseProblem', () => {
  it('names which half of the check failed', () => {
    expect(releaseProblem({ tag_name: 'v0.0.9', assets: complete('v0.0.9') })).toBeNull();
    // `v-old-*` is the old compiler's scheme: nothing about its archives to report.
    expect(releaseProblem({ tag_name: 'v-old-0.0.42', assets: [] }))
      .toContain('not a tag of the form');
    expect(releaseProblem({ tag_name: 'v0.0.9', assets: 'six' }))
      .toBe('v0.0.9 carries no list of assets.');
    expect(releaseProblem({ tag_name: 'v0.0.9', assets: [] }))
      .toContain('hylo-v0.0.9-windows-arm64.tar.zst');
  });
});

describe('parseLatestTag', () => {
  it('accepts a fully published release, pre-release tags included', () => {
    expect(parseLatestTag({ tag_name: 'v0.0.9', assets: complete('v0.0.9') })).toBe('v0.0.9');
    expect(parseLatestTag({ tag_name: 'v0.1.0-rc1', assets: complete('v0.1.0-rc1') }))
      .toBe('v0.1.0-rc1');
  });

  it('rejects a release whose archives are missing or incomplete', () => {
    // Not hypothetical: v0.0.9 was published with zero assets, and the install
    // instructions would have pointed at files that did not exist.
    expect(parseLatestTag({ tag_name: 'v0.0.9', assets: [] })).toBeNull();
    expect(parseLatestTag({ tag_name: 'v0.0.9', assets: complete('v0.0.9').slice(0, -1) }))
      .toBeNull();
    // A release retagged after its archives were uploaded.
    expect(parseLatestTag({ tag_name: 'v0.1.0', assets: complete('v0.0.9') })).toBeNull();
  });

  it('rejects malformed tags', () => {
    const assets = complete('v0.0.9');
    for (const tag_name of ['v-old-0.0.42', '0.0.9', 'nightly', '', 42, undefined]) {
      expect(parseLatestTag({ tag_name, assets })).toBeNull();
    }
  });

  it('rejects malformed payloads without throwing', () => {
    for (const payload of [null, undefined, 'v0.0.9', [], { tag_name: 'v0.0.9' },
                           { tag_name: 'v0.0.9', assets: 'six' },
                           { tag_name: 'v0.0.9', assets: [null, 1, {}] }]) {
      expect(parseLatestTag(payload)).toBeNull();
    }
  });
});

describe('the committed release tag', () => {
  it('is the placeholder, not a real release', () => {
    // `scripts/write-release-tag.ts` overwrites this file in CI. Committing its
    // output would silently pin the docs to whatever release was current then.
    expect(tag).toBe('v0.0.0-dev');
  });
});

describe('the release pages', () => {
  /**
   * Every version on these pages is generated from `tag`. A hand-written one
   * would still render, but would then be frozen at whatever the author typed.
   * `@v1.0.0` action refs are exempt: those pin the setup action, not the compiler.
   */
  const PAGES = [
    'src/content/docs/docs/user/installation.mdx',
    'src/content/docs/docs/user/tooling/ci.mdx',
  ];

  it.each(PAGES)('contains no hand-written release version (%s)', async (page) => {
    const source = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    expect(source.match(/(?<![\w@.])v\d+\.\d+\.\d+/g)).toBeNull();
  });

  /**
   * The `PATH` instructions name the install directory in prose, so they have to be
   * edited alongside `downloadCommand`'s extraction target — otherwise they send the
   * reader to an empty directory.
   */
  it('tells the reader to add the directory the archive unpacks into to PATH', async () => {
    const page = 'src/content/docs/docs/user/installation.mdx';
    const source = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    expect(source).toContain(POSIX_INSTALL_DIR);
    expect(source).toContain(WINDOWS_INSTALL_DIR);
  });
});
