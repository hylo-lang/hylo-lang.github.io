/**
 * The Hylo release the documentation describes.
 *
 * `assetName` is the single description of the release naming scheme: the CI
 * script validates a release against it and the install snippets are built from
 * it, so the file the docs offer cannot drift from the file we checked for.
 */
import { tag } from './release-tag.ts';

/** Operating systems we publish a toolchain archive for. */
export const PLATFORMS = ['linux', 'macos', 'windows'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Architectures we publish a toolchain archive for. */
export const ARCHITECTURES = ['x64', 'arm64'] as const;
export type Architecture = (typeof ARCHITECTURES)[number];

/** Release tags are `vMAJOR.MINOR.PATCH`, optionally with a pre-release suffix. */
const TAG_PATTERN = /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const DOWNLOAD_BASE = 'https://github.com/hylo-lang/hylo-new/releases/download';

export { tag };

/** The tag without its leading `v`, as `hc --version` prints it. */
export const version = tag.replace(/^v/, '');

/** The archive file name for `tag` on `platform`/`architecture`. */
export function assetName(
  tag: string,
  platform: Platform,
  architecture: Architecture,
): string {
  return `hylo-${tag}-${platform}-${architecture}.tar.zst`;
}

/** Where that archive is served from. */
export function downloadUrl(
  tag: string,
  platform: Platform,
  architecture: Architecture,
): string {
  return `${DOWNLOAD_BASE}/${tag}/${assetName(tag, platform, architecture)}`;
}

/**
 * Commands that download and unpack `tag` into the conventional location.
 *
 * Windows needs `curl.exe`, because `curl` is a PowerShell alias for
 * `Invoke-WebRequest`, which has no `-LO`.
 */
export function downloadCommand(
  tag: string,
  platform: Platform,
  architecture: Architecture,
): string {
  const url = downloadUrl(tag, platform, architecture);
  const archive = assetName(tag, platform, architecture);

  if (platform === 'windows') {
    return [
      `curl.exe -LO ${url}`,
      'mkdir "$env:LOCALAPPDATA\\Hylo"',
      `tar --zstd -xf ${archive} -C "$env:LOCALAPPDATA\\Hylo"`,
    ].join('\n');
  }

  return [
    `curl -LO ${url}`,
    `mkdir -p ~/.local/hylo && tar --zstd -xf ${archive} -C ~/.local/hylo`,
  ].join('\n');
}

/** The names of the archives `tag` is expected to publish. */
export function expectedAssets(tag: string): string[] {
  return PLATFORMS.flatMap((p) => ARCHITECTURES.map((a) => assetName(tag, p, a)));
}

/**
 * The release tag in a `releases/latest` payload, or `null` if it isn't usable.
 *
 * The asset check is the important half: `v0.0.9` was briefly published with zero
 * assets, and the install instructions would have pointed at files that did not
 * exist. A release that is still uploading counts as not yet available.
 */
export function parseLatestTag(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const { tag_name: tag, assets } = payload as { tag_name?: unknown; assets?: unknown };
  if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) return null;
  if (!Array.isArray(assets)) return null;

  const published = new Set(
    assets.map((a) => (a as { name?: unknown })?.name).filter((n) => typeof n === 'string'),
  );
  return expectedAssets(tag).every((name) => published.has(name)) ? tag : null;
}
