/**
 * The full-screen playground's state as text, for links to it and for remembering it across
 * visits.
 *
 * The state is written as a JSON object naming the version of its schema, `version`. In a link
 * it follows `#state=` in the fragment, as UTF-8 in base64url; in local storage it is the JSON
 * itself. Reading it validates it against the schema of its version, so that a link of any origin
 * yields either a well-formed state or a problem to tell the reader, and nothing else.
 *
 * Every version ever written has a schema below, which reads it into the current
 * `PlaygroundState`, so that links keep opening after the schema changes. A change to what the
 * state holds adds a version, with a schema of its own, while the older schemas stay and map what
 * they hold onto the current state.
 *
 * Version 1 is `{ version: 1, source, optimization?, standardLibrary?, stopAfter?, view? }`, with
 * the fields of `PlaygroundState`; the optional ones default to 0, `true`, `null` and `"result"`.
 * Fields it does not name are ignored.
 */
import * as v from 'valibot';
import { OPTIMIZATION_LEVELS, PHASES, type CompileSettings } from './settings';
import { PLAYGROUND_PATH } from './site';
import { OUTPUTS, type Output } from './views';

/** What the full-screen playground shows: everything a link to it reproduces. */
export interface PlaygroundState extends CompileSettings {
  /** The code in the editor. */
  source: string;
  /** The view of the compilation shown. */
  view: Output;
}

/** What reading a state found. */
export type Decoded =
  | { state: PlaygroundState }
  /** A state that could not be read, and why, in a sentence for the reader. */
  | { problem: string };

/** The version `serialize` writes. */
const CURRENT_VERSION = 1;

/** Version 1 of the state. */
const Version1 = v.object({
  version: v.literal(1),
  source: v.string(),
  optimization: v.optional(v.picklist(OPTIMIZATION_LEVELS), 0),
  standardLibrary: v.optional(v.boolean(), true),
  stopAfter: v.optional(v.nullable(v.picklist(PHASES)), null),
  view: v.optional(v.picklist(OUTPUTS), 'result'),
});

/** A state of any version, read as the current state. */
const State: v.GenericSchema<unknown, PlaygroundState> = v.pipe(
  v.variant('version', [Version1]),
  v.transform(({ source, optimization, standardLibrary, stopAfter, view }) => ({
    source,
    optimization,
    standardLibrary,
    stopAfter,
    view,
  })),
);

/** What every version has in common: the version, which says how to read the rest. */
const Versioned = v.looseObject({ version: v.pipe(v.number(), v.integer(), v.minValue(1)) });

/** Returns `state` as JSON, in the current version. */
export function serialize(state: PlaygroundState): string {
  const { source, optimization, standardLibrary, stopAfter, view } = state;
  return JSON.stringify({
    version: CURRENT_VERSION,
    source,
    optimization,
    standardLibrary,
    stopAfter,
    view,
  });
}

/** Returns the state `json` holds, as `serialize` writes it in any version, or why it holds none. */
export function deserialize(json: string): Decoded {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return damaged;
  }
  const versioned = v.safeParse(Versioned, value);
  if (versioned.success && versioned.output.version > CURRENT_VERSION) {
    return { problem: 'The link was made by a newer playground; reload the page and try again.' };
  }
  const state = v.safeParse(State, value);
  return state.success ? { state: state.output } : damaged;
}

/** Returns `state` as the fragment of a link, without its `#`. */
export function encodeFragment(state: PlaygroundState): string {
  return `state=${toBase64Url(new TextEncoder().encode(serialize(state)))}`;
}

/**
 * Returns the state in `fragment`, a link's fragment with or without its `#`, or why it holds
 * none; `null` if it does not try to hold one, having no `state` parameter.
 */
export function decodeFragment(fragment: string): Decoded | null {
  const payload = new URLSearchParams(fragment.replace(/^#/, '')).get('state');
  if (payload === null) return null;
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(payload));
  } catch {
    return damaged;
  }
  return deserialize(json);
}

/** Returns the address of the full-screen playground, opened on `state`. */
export function playgroundURL(state: PlaygroundState): string {
  return `${PLAYGROUND_PATH}#${encodeFragment(state)}`;
}

/** What reading a state that is not one finds. */
const damaged: Decoded = {
  problem: 'The link is damaged: it does not hold code the playground can read.',
};

/** Returns `bytes` in base64url, without padding. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Returns the bytes `text` encodes in base64url, with or without padding.
 *
 * Throws a `SyntaxError` if `text` is not base64url.
 */
function fromBase64Url(text: string): Uint8Array {
  // `atob` also accepts whitespace and the standard alphabet, which a link never holds.
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new SyntaxError('not base64url');
  let binary: string;
  try {
    binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new SyntaxError('not base64url');
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
