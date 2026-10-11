/**
 * How a playground asks the compiler to compile code: the settings a snippet or the full-screen
 * playground compiles with, and the request they make of the compiler.
 */
import type { Artifact, CompileRequest, Phase } from '@hylo-lang/hylo-wasm/protocol';

/** LLVM's optimization levels, from none to the most. */
export const OPTIMIZATION_LEVELS = [0, 1, 2, 3] as const;

/** An optimization level of LLVM: an element of `OPTIMIZATION_LEVELS`. */
export type OptimizationLevel = (typeof OPTIMIZATION_LEVELS)[number];

/** The phases after which compilation can stop, in the order the compiler runs them. */
export const PHASES = ['parsing', 'scoping', 'typing', 'lowering'] as const satisfies readonly Phase[];

/** Fails to type-check unless `PHASES` lists every `Phase` the compiler knows. */
const _everyPhaseIsListed: [Exclude<Phase, (typeof PHASES)[number]>] extends [never] ? true : never =
  true;

/** How code is compiled. */
export interface CompileSettings {
  optimization: OptimizationLevel;
  /** `false` iff the code is compiled without the standard library. */
  standardLibrary: boolean;
  /**
   * The phase after which compilation stops, for code that is not a program, which is then
   * checked but not run; `null` for a program, which is compiled to an executable and run.
   */
  stopAfter: Phase | null;
}

/** How code is compiled unless something says otherwise: a program, run, unoptimized. */
export const DEFAULT_SETTINGS: Readonly<CompileSettings> = {
  optimization: 0,
  standardLibrary: true,
  stopAfter: null,
};

/**
 * Returns the request compiling `source` with `settings`, producing `artifacts`, and an
 * executable to run unless `settings.stopAfter` stops compilation before there is one.
 */
export function compileRequest(
  source: string,
  artifacts: readonly Artifact[],
  settings: CompileSettings,
): CompileRequest {
  const emit: NonNullable<CompileRequest['emit']> = [...artifacts];
  if (settings.stopAfter === null) emit.push('executable');
  return {
    source,
    emit,
    optimization: settings.optimization,
    standardLibrary: settings.standardLibrary,
    ...(settings.stopAfter !== null && { stopAfter: settings.stopAfter }),
  };
}

/**
 * Returns the optimization level `text` names, such as `"2"`.
 *
 * Throws a `RangeError` if `text` names none: the texts this is given (a select's options, an
 * attribute `Playground.astro` checked) can only name one unless the page itself is wrong.
 */
export function parseOptimizationLevel(text: string): OptimizationLevel {
  const level = OPTIMIZATION_LEVELS.find((level) => String(level) === text);
  if (level === undefined) throw new RangeError(`'${text}' is not an optimization level`);
  return level;
}

/**
 * Returns the phase `text` names, such as `"typing"`, or `null` if `text` is empty, naming none.
 *
 * Throws a `RangeError` if `text` is neither, for the reason `parseOptimizationLevel` does.
 */
export function parsePhase(text: string): Phase | null {
  if (text === '') return null;
  const phase = PHASES.find((phase) => phase === text);
  if (phase === undefined) throw new RangeError(`'${text}' is not a phase of compilation`);
  return phase;
}

/** The shortest time limit a reader can choose for each stage of a request, in seconds. */
export const MIN_TIME_LIMIT = 1;

/** The longest time limit a reader can choose for each stage of a request, in seconds. */
export const MAX_TIME_LIMIT = 600;

/** The time limit of each stage of a request, in seconds, unless the reader chooses another. */
export const DEFAULT_TIME_LIMIT = 20;

/**
 * Returns the time limit `text` gives in seconds, such as `"20"`, rounded to a whole number and
 * brought within `MIN_TIME_LIMIT` and `MAX_TIME_LIMIT`; or `DEFAULT_TIME_LIMIT` if it gives no
 * number, as a value remembered from an older page or tampered with may not.
 */
export function parseTimeLimit(text: string | null): number {
  const seconds = text === null || text.trim() === '' ? NaN : Number(text);
  if (!Number.isFinite(seconds)) return DEFAULT_TIME_LIMIT;
  return Math.min(MAX_TIME_LIMIT, Math.max(MIN_TIME_LIMIT, Math.round(seconds)));
}
