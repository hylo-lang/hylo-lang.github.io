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
