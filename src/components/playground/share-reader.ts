/**
 * Reading the full-screen playground's state from text, in the format `share.ts` documents and
 * writes, validating it against the schema of its version.
 */
import * as v from 'valibot';
import { OPTIMIZATION_LEVELS, PHASES } from './settings';
import { CURRENT_VERSION, DEFAULT_STATE, type PlaygroundState } from './share';
import { OUTPUTS } from './views';

/** What reading a state found. */
export type Decoded =
  | { state: PlaygroundState }
  /** A state that could not be read, and why, in a sentence for the reader. */
  | { problem: string };

/** Version 1 of the state. */
const Version1 = v.object({
  version: v.literal(1),
  source: v.string(),
  optimization: v.optional(v.picklist(OPTIMIZATION_LEVELS), DEFAULT_STATE.optimization),
  standardLibrary: v.optional(v.boolean(), DEFAULT_STATE.standardLibrary),
  stopAfter: v.optional(v.nullable(v.picklist(PHASES)), DEFAULT_STATE.stopAfter),
  view: v.optional(v.picklist(OUTPUTS), DEFAULT_STATE.view),
});

/** A state of any version, read as the current state. */
const State: v.GenericSchema<unknown, PlaygroundState> = v.pipe(
  v.variant('version', [Version1]),
  // `object` drops the fields its schema does not name, which leaves the version to drop.
  v.transform(({ version: _, ...state }) => state),
);

/** What every version has in common: the version, which says how to read the rest. */
const Versioned = v.looseObject({ version: v.pipe(v.number(), v.integer(), v.minValue(1)) });

/** What reading a state that is not one finds. */
const damaged: Decoded = {
  problem: 'The link is damaged: it does not hold code the playground can read.',
};

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
