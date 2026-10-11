/**
 * The stages of serving a request, and where each one stands, so that a playground can show the
 * results of each as soon as it is done, and say which are still to come.
 */
import type { CompilationStage, CompileRequest } from '@hylo-lang/hylo-wasm/protocol';
import type { View } from './views';

/**
 * A stage of serving a request: the front end (diagnostics, Hylo IR), the back end (LLVM IR,
 * WebAssembly, the executable), and running the executable.
 */
export type Stage = CompilationStage | 'run';

/** Every stage, in the order they happen. */
export const STAGES = ['front-end', 'back-end', 'run'] as const satisfies readonly Stage[];

/** What each stage is called. */
export const STAGE_TITLES: Record<Stage, string> = {
  'front-end': 'Front end',
  'back-end': 'Code generation',
  run: 'Execution',
};

/** What each stage is called within a sentence. */
const STAGE_NAMES_IN_SENTENCES: Record<Stage, string> = {
  'front-end': 'the front end',
  'back-end': 'code generation',
  run: 'execution',
};

/**
 * Where a stage stands:
 * - `off`: the request does not include it;
 * - `waiting`: it has not begun;
 * - `running`: it has begun;
 * - `done`: it is done, its results in;
 * - `failed`: it did not finish: the compiler failed, or the page stopped waiting;
 * - `skipped`: it did not run, because an earlier stage failed or found errors.
 */
export type StageState = 'off' | 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

/** Where every stage of a request stands. */
export type Stages = Readonly<Record<Stage, StageState>>;

/** How a request ended, as far as its stages are concerned. */
export type RequestEnding =
  /** It was not served to the end: the compiler failed, or the page stopped waiting. */
  | 'failed'
  /** The front end found errors in the program. */
  | 'errors'
  /** Compiling succeeded; `ran` is whether the executable ran. */
  | { ran: boolean };

/**
 * Returns the stages serving `request` takes, in order: running the executable, if it asks for
 * one.
 */
export function plannedStages(request: CompileRequest): Stage[] {
  if (request.stopAfter !== undefined) return ['front-end'];
  const emit = request.emit ?? ['executable'];
  const stages: Stage[] = ['front-end'];
  if (emit.some((a) => a === 'llvm' || a === 'assembly' || a === 'executable')) {
    stages.push('back-end');
  }
  if (emit.includes('executable')) stages.push('run');
  return stages;
}

/**
 * Returns where the `planned` stages of a request being served stand: those up to
 * `lastStageDone` (none if `null`) are done, the next is running if the request has `begun`, and
 * the others are waiting.
 */
export function stagesInProgress(
  planned: readonly Stage[],
  lastStageDone: Stage | null,
  begun: boolean,
): Stages {
  const next = lastStageDone === null ? 0 : planned.indexOf(lastStageDone) + 1;
  return stagesFrom(planned, (i) =>
    i < next ? 'done' : i === next && begun ? 'running' : 'waiting',
  );
}

/**
 * Returns where the `planned` stages of a request stand once it has ended as `ending`,
 * `lastStageDone` being the last one done before it ended (`null` if none was): a failure fails
 * the stage after it, errors are the front end's, and a success does every stage, but running a
 * program that did not run.
 */
export function stagesEnded(
  planned: readonly Stage[],
  lastStageDone: Stage | null,
  ending: RequestEnding,
): Stages {
  const next = lastStageDone === null ? 0 : planned.indexOf(lastStageDone) + 1;
  if (ending === 'failed') {
    return stagesFrom(planned, (i) => (i < next ? 'done' : i === next ? 'failed' : 'skipped'));
  }
  if (ending === 'errors') return stagesFrom(planned, (i) => (i === 0 ? 'done' : 'skipped'));
  return stagesFrom(planned, (_, stage) => (stage === 'run' && !ending.ran ? 'skipped' : 'done'));
}

/** Returns `true` iff `state` is that of a stage whose outcome is known. */
export function isSettled(state: StageState): boolean {
  return state !== 'waiting' && state !== 'running';
}

/**
 * Returns the stage producing what `view` shows, whose end it waits for, given where the stages
 * of the request stand: Hylo IR the front end, LLVM IR and WebAssembly the back end, the
 * diagnostics the last compiling stage, and the result the last stage.
 */
export function stageProducing(view: View, stages: Stages): Stage {
  const lastIncluded = (candidates: readonly Stage[]): Stage =>
    candidates.findLast((stage) => stages[stage] !== 'off') ?? 'front-end';
  switch (view) {
    case 'raw-ir':
    case 'ir':
      return 'front-end';
    case 'llvm':
    case 'assembly':
      return 'back-end';
    case 'diagnostics':
      return lastIncluded(['front-end', 'back-end']);
    case 'result':
      return lastIncluded(STAGES);
  }
}

/**
 * Returns a brief phrase saying what `stage`, which is not settled, is waiting for, or that it is
 * running, given where every stage stands.
 */
export function describeWait(stage: Stage, stages: Stages): string {
  if (stages[stage] === 'running') return `${STAGE_TITLES[stage]} in progress`;
  const running = STAGES.find((other) => stages[other] === 'running');
  return running === undefined
    ? 'Waiting to start'
    : `Waiting for ${STAGE_NAMES_IN_SENTENCES[running]}`;
}

/** Returns a word or two saying what `state` means, for the reader. */
export function describeStageState(state: StageState): string {
  switch (state) {
    case 'off':
      return 'not requested';
    case 'waiting':
      return 'not started';
    case 'running':
      return 'in progress';
    case 'done':
      return 'done';
    case 'failed':
      return 'did not finish';
    case 'skipped':
      return 'skipped';
  }
}

/**
 * Returns the stages, `off` unless `planned`, the `i`th planned one, `stage`, standing as
 * `stateOf(i, stage)` says.
 */
function stagesFrom(
  planned: readonly Stage[],
  stateOf: (i: number, stage: Stage) => StageState,
): Stages {
  const stages: Record<Stage, StageState> = { 'front-end': 'off', 'back-end': 'off', run: 'off' };
  for (const [i, stage] of planned.entries()) stages[stage] = stateOf(i, stage);
  return stages;
}
