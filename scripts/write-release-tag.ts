/**
 * Records the latest Hylo release in `src/release-tag.ts`, for the site to build
 * against. Run by CI before every build; see `.github/workflows/ci.yml`.
 *
 * Exits non-zero without writing if the release cannot be resolved. The committed
 * placeholder would otherwise ship download links to archives that do not exist,
 * so a failure here has to fail the build.
 */
import { writeFileSync } from 'node:fs';
import { expectedAssets, parseLatestTag } from '../src/release.ts';

const API_URL = 'https://api.github.com/repos/hylo-lang/hylo-new/releases/latest';
const TARGET = new URL('../src/release-tag.ts', import.meta.url);

const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
// Raises GitHub's unauthenticated rate limit, which is shared across CI egress IPs.
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const response = await fetch(API_URL, { headers, signal: AbortSignal.timeout(15_000) });
if (!response.ok) {
  console.error(`${API_URL} returned ${response.status} ${response.statusText}`);
  process.exit(1);
}

const payload = await response.json();
const tag = parseLatestTag(payload);
if (!tag) {
  const published = new Set((payload?.assets ?? []).map((a: { name?: string }) => a.name));
  const missing = expectedAssets(payload?.tag_name ?? '').filter((n) => !published.has(n));
  console.error(`Unusable release ${JSON.stringify(payload?.tag_name)}.`);
  if (missing.length) console.error(`Missing assets:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const source = `/**
 * The release the site is built against.
 *
 * Overwritten in place by \`scripts/write-release-tag.ts\`, which CI runs before
 * every build. The committed value is a placeholder: seeing \`0.0.0-dev\` on a
 * deployed page means that step did not run.
 */
export const tag = ${JSON.stringify(tag)};
`;
writeFileSync(TARGET, source);
console.log(`Building against ${tag}`);
