/**
 * The playground's state as text, for links (`#v=1&s=…`) and for remembering it across visits.
 *
 * The text is versioned: `v` names the schema of `s`, and `DECODERS` has a decoder for every
 * version ever written, so that a link keeps opening after the schema changes. A change to what
 * the state holds adds a version: a new `encode` writing it and a decoder reading it, while the
 * decoders of the older versions stay, mapping what they read onto the current state.
 *
 * Version 1: `s` is the JSON of `{ source, optimization, view }`, deflated (`deflate-raw`) and in
 * base64url; `optimization` and `view` may be missing, and other fields are ignored.
 */
import { PLAYGROUND_PATH } from './site';
import { OUTPUTS, type Output } from './views';

/** An optimization level of LLVM. */
export type OptimizationLevel = 0 | 1 | 2 | 3;

/** What the playground shows: everything a link reproduces. */
export interface PlaygroundState {
  /** The code in the editor. */
  source: string;
  optimization: OptimizationLevel;
  /** The view of the compilation shown. */
  view: Output;
}

/** The version `encode` writes. */
const CURRENT_VERSION = '1';

/** Returns `state` as text, `v=<version>&s=<payload>`, the fragment of a link. */
export async function encode(state: PlaygroundState): Promise<string> {
  const { source, optimization, view } = state;
  const payload = await deflate(JSON.stringify({ source, optimization, view }));
  return new URLSearchParams({ v: CURRENT_VERSION, s: payload }).toString();
}

/** What reading a state from text found. */
export type Decoded =
  | { state: PlaygroundState }
  /** A state that could not be read, and why, in a sentence for the reader. */
  | { problem: string };

/**
 * Returns the state in `text`, a link's fragment with or without its `#`, or `null` if it holds
 * none.
 */
export async function decode(text: string): Promise<Decoded | null> {
  const params = new URLSearchParams(text.replace(/^#/, ''));
  const version = params.get('v');
  const payload = params.get('s');
  if (version === null || payload === null) return null;
  const decoder = DECODERS[version];
  if (!decoder) {
    return { problem: 'The link was made by a newer playground; reload the page and try again.' };
  }
  try {
    return { state: await decoder(payload) };
  } catch {
    return { problem: 'The link is damaged: it does not hold code the playground can read.' };
  }
}

/** Reads a payload of each version, throwing if it is not one. */
const DECODERS: Record<string, (payload: string) => Promise<PlaygroundState>> = {
  async 1(payload) {
    const json: unknown = JSON.parse(await inflate(payload));
    if (typeof json !== 'object' || json === null) throw new Error('not an object');
    const { source, optimization = 0, view = 'result' } = json as Record<string, unknown>;
    if (typeof source !== 'string') throw new Error('no source');
    if (!isOptimizationLevel(optimization)) throw new Error('bad optimization level');
    if (!OUTPUTS.includes(view as Output)) throw new Error('bad view');
    return { source, optimization, view: view as Output };
  },
};

/** Returns `true` iff `x` is an optimization level. */
export function isOptimizationLevel(x: unknown): x is OptimizationLevel {
  return x === 0 || x === 1 || x === 2 || x === 3;
}

/** Returns the address of the full-screen playground, opened on `state`. */
export async function playgroundURL(state: PlaygroundState): Promise<string> {
  return `${PLAYGROUND_PATH}#${await encode(state)}`;
}

/** Returns `text`, deflated and in base64url. */
async function deflate(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns the text `deflate` encoded as `payload`. */
async function inflate(payload: string): Promise<string> {
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  // `fatal`, so that bytes that are not UTF-8 are an error rather than replacement characters.
  return new TextDecoder('utf-8', { fatal: true }).decode(await new Response(stream).arrayBuffer());
}
