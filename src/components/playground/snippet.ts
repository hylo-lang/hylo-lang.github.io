/**
 * What a runnable snippet asks of the compiler and promises to do, shared by the snippets
 * themselves (`playground-element.ts`), the component checking them as the site builds
 * (`Playground.astro`), and the test running them (`snippets.test.ts`).
 */
import type { CompileRequest, SourceFile } from '@hylo-lang/hylo-wasm/protocol';
import { compileRequest, type CompileSettings } from './settings';
import { isArtifactView, type View } from './views';

/** The settings of a snippet, as `Playground.astro` takes them. */
export interface SnippetSettings extends CompileSettings {
  /** The views the snippet offers, in order; the first is shown first. Never empty. */
  views: readonly View[];
}

/**
 * A file of a snippet's program that the snippet shows: the code shown, which the reader may
 * edit, with the code of the file compiled before and after it without being shown.
 */
export interface ShownFile {
  /** The file's name. */
  file: string;
  /** The code of the file before `source`, not shown. */
  prelude: string;
  /** The code shown. */
  source: string;
  /** The code of the file after `source`, not shown. */
  epilogue: string;
}

/**
 * The code of a snippet: the files of its program, some of which it shows, in tabs if it shows
 * several. `src/plugins/playground-source.ts` collects them.
 */
export interface SnippetCode {
  /**
   * The files of the program, in the order the compiler reads them, with the contents of those
   * in `shown` left out (empty): `shown` holds them.
   */
  files: SourceFile[];
  /** The files shown, in the order of their tabs; never empty. */
  shown: ShownFile[];
}

/** Returns the parts of a file, those that are not empty, one line after another. */
export const joinLines = (parts: readonly string[]): string =>
  parts.filter((part) => part !== '').join('\n');

/**
 * Returns the files of the program `code` makes, with `sources` as the code shown in each of
 * `code.shown`, in order: by default, the code the snippet shows.
 */
export function assembleProgram(
  code: SnippetCode,
  sources: readonly string[] = code.shown.map((f) => f.source),
): SourceFile[] {
  return code.files.map((f) => {
    const i = code.shown.findIndex((shown) => shown.file === f.name);
    if (i < 0) return f;
    const { prelude, epilogue } = code.shown[i];
    return { name: f.name, contents: joinLines([prelude, sources[i], epilogue]) };
  });
}

/** Returns how many lines `text` has: none if it is empty. */
export const lineCount = (text: string): number => (text === '' ? 0 : text.split('\n').length);

/**
 * Returns how many lines of `shown.file` come before the code shown: what to subtract from a line
 * of that file to get the line of the code shown.
 */
export function shownCodeOffset(shown: ShownFile): number {
  return lineCount(shown.prelude);
}

/** Returns the request compiling `files` as a snippet with `settings` does. */
export function snippetRequest(
  files: readonly SourceFile[],
  settings: SnippetSettings,
): CompileRequest {
  return compileRequest(files, settings.views.filter(isArtifactView), settings);
}

/** What a snippet does: its `expect` attribute. */
export type Expectation =
  /** It runs, and exits with `status`. */
  | { kind: 'exit'; status: number }
  /** It runs, and traps. */
  | { kind: 'trap' }
  /** It does not compile. */
  | { kind: 'error' }
  /** It compiles, and if it is a program, runs to completion. */
  | { kind: 'ok' };

/**
 * Returns the expectation `text` describes, in one of `EXPECTATION_FORMS`, ignoring surrounding
 * whitespace, or `null` if it describes none.
 */
export function parseExpectation(text: string): Expectation | null {
  const match = /^\s*(?:exit\s+(-?\d+)|(trap|error|ok))\s*$/.exec(text);
  if (!match) return null;
  const [, status, kind] = match;
  if (status !== undefined) return { kind: 'exit', status: Number(status) };
  return { kind: kind as 'trap' | 'error' | 'ok' };
}

/** The forms an `expect` attribute takes, for error messages. */
export const EXPECTATION_FORMS = '`exit N`, `trap`, `error` or `ok`';
