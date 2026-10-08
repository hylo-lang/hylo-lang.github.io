/** Fetching from GitHub in the site's build scripts. */

/**
 * Returns `url`, or exits the process saying why it could not be fetched. A status in `allow` is
 * returned rather than treated as a failure.
 */
export async function fetchFromGitHub(
  url: string,
  { timeout = 15_000, allow = [] }: { timeout?: number; allow?: number[] } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  // Raises GitHub's unauthenticated rate limit, which is shared across CI egress IPs.
  if (process.env.GITHUB_TOKEN && new URL(url).hostname === 'api.github.com') {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
  if (!response.ok && !allow.includes(response.status)) {
    console.error(`${url} returned ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  return response;
}
