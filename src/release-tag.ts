/**
 * The release the site is built against.
 *
 * Overwritten in place by `scripts/write-release-tag.ts`, which CI runs before
 * every build. The committed value is a placeholder: seeing `0.0.0-dev` on a
 * deployed page means that step did not run.
 */
export const tag = 'v0.0.0-dev';
