/**
 * The full-screen playground's state as text, for links to it and for remembering it across
 * visits; this module writes it, and `share-reader.ts` reads it.
 *
 * The state is written as a JSON object naming the version of its schema, `version`. In a link
 * it follows `#state=` in the fragment, as UTF-8 in base64url; in local storage it is the JSON
 * itself. Reading it validates it against the schema of its version, so that a link of any origin
 * yields either a well-formed state or a problem to tell the reader, and nothing else.
 *
 * Every version ever written has a schema in `share-reader.ts`, which reads it into the current
 * `PlaygroundState`, so that links keep opening after the schema changes. A change to what the
 * state holds adds a version, with a schema of its own, while the older schemas stay and map what
 * they hold onto the current state.
 *
 * - Version 1 is `{ version: 1, source, optimization?, standardLibrary?, stopAfter?, view? }`: a
 *   program of one file, `source`, which reads as the file `main.hylo`.
 * - Version 2 is `{ version: 2, files, active?, optimization?, standardLibrary?, stopAfter?,
 *   view? }`, with the fields of `PlaygroundState`: `files` is a list of `{ name, contents }`, of
 *   distinct names that `isFileName` accepts, and `active` is one of them.
 *
 * The optional fields default to those of `DEFAULT_STATE`. Fields a version does not name are
 * ignored.
 *
 * Reading is kept apart from writing so that the pages that only write links, those with
 * snippets, do not load the validation library.
 */
import type { SourceFile } from '@hylo-lang/hylo-wasm/protocol';
import { DEFAULT_SETTINGS, type CompileSettings } from './settings';
import type { View } from './views';

/** What the full-screen playground shows: everything a link to it reproduces. */
export interface PlaygroundState extends CompileSettings {
  /** The files of the program, in order; never empty. */
  files: SourceFile[];
  /** The name of the file shown, if not the first; one of `files`. */
  active?: string;
  /** The view of the compilation shown. */
  view: View;
}

/** The state of everything but the code unless something says otherwise. */
export const DEFAULT_STATE: Readonly<Omit<PlaygroundState, 'files'>> = {
  ...DEFAULT_SETTINGS,
  view: 'result',
};

/** The name of the file of a program of one file. */
export const DEFAULT_FILE_NAME = 'main.hylo';

/** The version `serialize` writes. */
export const CURRENT_VERSION = 2;

/** Returns `state` as JSON, in the current version. */
export function serialize(state: PlaygroundState): string {
  const { files, active, optimization, standardLibrary, stopAfter, view } = state;
  return JSON.stringify({
    version: CURRENT_VERSION,
    files,
    active,
    optimization,
    standardLibrary,
    stopAfter,
    view,
  });
}

/** Returns `state` as the fragment of a link, without its `#`. */
export function encodeFragment(state: PlaygroundState): string {
  return `state=${toBase64Url(new TextEncoder().encode(serialize(state)))}`;
}

/** Returns the address of the full-screen playground, opened on `state`. */
export function playgroundURL(state: PlaygroundState): string {
  return `/playground/#${encodeFragment(state)}`;
}

/** Returns `bytes` in base64url, without padding. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
