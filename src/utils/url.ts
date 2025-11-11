/**
 * Simple utility to create URLs with the correct base path for Astro components
 */

/**
 * Create an internal URL with the base path
 * @param path - Path without leading slash (e.g., 'blog', 'docs/contributing')
 */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return base + cleanPath;
}