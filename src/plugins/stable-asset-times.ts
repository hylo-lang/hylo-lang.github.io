/**
 * An Astro integration giving the files of the build's asset directory (`_astro/`) a fixed
 * modification time, so that a deployment leaves the HTTP validators of an unchanged file as they
 * were.
 *
 * GitHub Pages derives a file's `ETag` and `Last-Modified` from its modification time, which a
 * build sets to the time of the build. Every deployment would then change them, and a browser
 * revalidating its cached copy after the `max-age` GitHub Pages sets (10 minutes) would download
 * every file again, the 38 MB compiler included, although its content is unchanged.
 *
 * Only the asset directory is touched: Vite names every file there by a hash of its content, so a
 * file whose content changes gets a new name, and its fixed time can never make a browser keep a
 * stale copy. Pages, whose names stay, keep the time of the build.
 */
import { readdirSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/** The modification time every asset gets. */
const FIXED_TIME = new Date('2000-01-01T00:00:00Z');

/** Returns the integration; see the module's documentation. */
export function stableAssetTimes(): AstroIntegration {
  let assets = '_astro';
  return {
    name: 'hylo:stable-asset-times',
    hooks: {
      'astro:config:done': ({ config }) => {
        assets = config.build.assets;
      },
      'astro:build:done': ({ dir, logger }) => {
        const root = path.join(fileURLToPath(dir), assets);
        const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) =>
          e.isFile(),
        );
        for (const f of files) utimesSync(path.join(f.parentPath, f.name), FIXED_TIME, FIXED_TIME);
        logger.info(`gave the ${files.length} files of ${assets}/ a fixed modification time`);
      },
    },
  };
}
