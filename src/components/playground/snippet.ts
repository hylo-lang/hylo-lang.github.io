/**
 * What a runnable snippet asks of the compiler and promises to do, shared by the snippets
 * themselves, the component checking them as the site builds, and the test running them.
 */
import type { CompileRequest, Phase } from './protocol';
import { isArtifact, type Output } from './views';

/** The settings of a snippet, as `Playground.astro` takes them. */
export interface SnippetSettings {
  outputs: readonly Output[];
  optimization: number;
  standardLibrary: boolean;
  stopAfter?: Phase;
}

/** Returns the request compiling `source` as a snippet with `settings`. */
export function snippetRequest(source: string, settings: SnippetSettings): CompileRequest {
  const emit: CompileRequest['emit'] = settings.outputs.filter(isArtifact);
  // A snippet that stops early is not a program, and has nothing to run.
  if (!settings.stopAfter) emit.push('executable');
  return {
    source,
    emit,
    optimization: settings.optimization,
    standardLibrary: settings.standardLibrary,
    stopAfter: settings.stopAfter,
  };
}

/** What a snippet does: its `expect` attribute. */
export type Expectation =
  | { kind: 'exit'; status: number }
  | { kind: 'trap' }
  | { kind: 'error' }
  | { kind: 'ok' };

/** Returns the expectation `text` describes, or `null` if it describes none. */
export function parseExpectation(text: string): Expectation | null {
  const m = /^\s*(?:exit\s+(-?\d+)|(trap|error|ok))\s*$/.exec(text);
  if (!m) return null;
  if (m[1] !== undefined) return { kind: 'exit', status: Number(m[1]) };
  return { kind: m[2] as 'trap' | 'error' | 'ok' };
}

/** The forms an `expect` attribute takes, for error messages. */
export const EXPECTATION_FORMS = '`exit N`, `trap`, `error` or `ok`';
