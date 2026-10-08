/**
 * Records the latest Hylo release in `src/release-tag.ts`, for the site to build
 * against. Run before every build by `.github/workflows/ci.yml` and
 * `.github/workflows/astro.yml`.
 *
 * Exits non-zero without writing if the release cannot be resolved. The committed
 * placeholder would otherwise ship download links to archives that do not exist,
 * so a failure here has to fail the build.
 */
import { writeFileSync } from 'node:fs';
import { parseLatestTag, releaseProblem } from '../src/release.ts';
import { fetchFromGitHub } from './github.ts';

const API_URL = 'https://api.github.com/repos/hylo-lang/hylo-new/releases/latest';
const TARGET = new URL('../src/release-tag.ts', import.meta.url);

const payload: unknown = await (await fetchFromGitHub(API_URL)).json();
const tag = parseLatestTag(payload);
if (!tag) {
  console.error(`Unusable release: ${releaseProblem(payload)}`);
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
