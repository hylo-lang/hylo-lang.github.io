/**
 * Code in a URL: `#code=` followed by the source, deflated and in base64url.
 *
 * The same format as hylo-new's own playground (`Tools/wasm/repl/src/share.ts`), so that a link
 * made by either opens in either. A link may also carry an optimization level, as `&o=2`.
 */

/** Returns `source` encoded for a `#code=` fragment. */
export async function encodeSource(source: string): Promise<string> {
  const deflated = new Blob([source]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(deflated).arrayBuffer());
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns the source in `hash`, a URL's fragment, or null if it holds none. */
export async function decodeSource(hash: string): Promise<string | null> {
  const m = /(?:^#|&)code=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const binary = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(inflated).text();
  } catch {
    return null;
  }
}

/** Returns the optimization level in `hash`, a URL's fragment (`&o=2`), if any. */
export function decodeOptimization(hash: string): number | null {
  const m = /(?:^#|&)o=([0-3])(?:&|$)/.exec(hash);
  return m ? Number(m[1]) : null;
}

/** Returns the address of the full-screen playground, opened on `source` at `optimization`. */
export async function playgroundURL(source: string, optimization = 0): Promise<string> {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const level = optimization > 0 ? `&o=${optimization}` : '';
  return `${base}playground/#code=${await encodeSource(source)}${level}`;
}
