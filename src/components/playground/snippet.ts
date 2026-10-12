/**
 * What a runnable snippet asks of the compiler and promises to do, shared by the snippets
 * themselves (`playground-element.ts`), the component checking them as the site builds
 * (`Playground.astro`), and the test running them (`snippets.test.ts`).
 */
import type { CompileRequest } from '@hylo-lang/hylo-wasm/protocol';
import { compileRequest, type CompileSettings } from './settings';
import { isArtifactView, type View } from './views';

/** The settings of a snippet, as `Playground.astro` takes them. */
export interface SnippetSettings extends CompileSettings {
  /** The views the snippet offers, in order; the first is shown first. Never empty. */
  views: readonly View[];
}

/**
 * The code of a snippet: the code it shows, and the code it compiles before and after it without
 * showing it, each empty if there is none. `src/plugins/playground-source.ts` collects them.
 */
export interface SnippetCode {
  /** The code compiled before `source`, not shown. */
  prelude: string;
  /** The code shown, which the reader may edit. */
  source: string;
  /** The code compiled after `source`, not shown. */
  epilogue: string;
}

/** Returns the program `code` makes: its parts, in order, one line after another. */
export function assembleProgram(code: SnippetCode): string {
  return [code.prelude, code.source, code.epilogue].filter((part) => part !== '').join('\n');
}

/**
 * Returns how many lines of the program `code` makes come before the code it shows: what to
 * subtract from a line of the program to get the line of the code shown.
 */
export function shownCodeOffset(code: SnippetCode): number {
  return code.prelude === '' ? 0 : code.prelude.split('\n').length;
}

/** Returns the request compiling `source` as a snippet with `settings` does. */
export function snippetRequest(source: string, settings: SnippetSettings): CompileRequest {
  return compileRequest(source, settings.views.filter(isArtifactView), settings);
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
