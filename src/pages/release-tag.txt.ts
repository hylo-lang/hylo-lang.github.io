import type { APIRoute } from 'astro';
import { tag } from '../release.ts';

/**
 * The compiler release this deployment's pages describe.
 *
 * `.github/workflows/astro.yml` reads it back from the live site to decide whether
 * a new release has left the site stale. That makes the deployment itself the
 * record of what we last built against, so there is no separate state to keep in
 * sync with it.
 */
export const GET: APIRoute = () => new Response(tag);
