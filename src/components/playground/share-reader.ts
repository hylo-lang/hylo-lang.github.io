/**
 * Reading the full-screen playground's state from text, in the format `share.ts` documents and
 * writes, validating it against the schema of its version.
 */
import * as v from 'valibot';
import { OPTIMIZATION_LEVELS, PHASES } from './settings';
import { isFileName } from './file-names';
import { CURRENT_VERSION, DEFAULT_FILE_NAME, DEFAULT_STATE, type PlaygroundState } from './share';
import { VIEWS } from './views';

/** What reading a state found. */
export type DecodedState =
  | { state: PlaygroundState }
  /** A state that could not be read, and why, in a sentence for the reader. */
  | { problem: string };

/** The settings and the view, which every version has, with their defaults. */
const settings = {
  optimization: v.optional(v.picklist(OPTIMIZATION_LEVELS), DEFAULT_STATE.optimization),
  standardLibrary: v.optional(v.boolean(), DEFAULT_STATE.standardLibrary),
  stopAfter: v.optional(v.nullable(v.picklist(PHASES)), DEFAULT_STATE.stopAfter),
  view: v.optional(v.picklist(VIEWS), DEFAULT_STATE.view),
};

/** Version 1 of the state: a program of one file, read as `main.hylo`. */
const Version1 = v.pipe(
  v.object({ version: v.literal(1), source: v.string(), ...settings }),
  v.transform(({ version: _, source, ...rest }): PlaygroundState => ({
    files: [{ name: DEFAULT_FILE_NAME, contents: source }],
    ...rest,
  })),
);

/** Version 2 of the state: a program of files, of distinct names, one of which may be shown. */
const Version2 = v.pipe(
  v.object({
    version: v.literal(2),
    files: v.pipe(
      v.array(v.object({ name: v.pipe(v.string(), v.check(isFileName)), contents: v.string() })),
      v.minLength(1),
      v.check((files) => new Set(files.map((f) => f.name)).size === files.length),
    ),
    active: v.optional(v.string()),
    ...settings,
  }),
  v.check(({ files, active }) => active === undefined || files.some((f) => f.name === active)),
  // `object` drops the fields its schema does not name, which leaves the version to drop.
  v.transform(({ version: _, ...state }): PlaygroundState => state),
);

/** A state of any version, read as the current state. */
const State: v.GenericSchema<unknown, PlaygroundState> = v.union([Version1, Version2]);

/** What every version has in common: the version, which says how to read the rest. */
const Versioned = v.looseObject({ version: v.pipe(v.number(), v.integer(), v.minValue(1)) });

/** What reading a state that is not one finds. */
const damaged: DecodedState = {
  problem: 'The link is damaged: it does not hold code the playground can read.',
};

/**
 * Returns the state `json` holds, as `serialize` writes it in any version, or why it holds none.
 */
export function deserialize(json: string): DecodedState {
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
export function decodeFragment(fragment: string): DecodedState | null {
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
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
