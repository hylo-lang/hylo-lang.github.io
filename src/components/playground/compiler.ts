/**
 * A page's compiler: one compiler worker (`@hylo-lang/hylo-wasm/compiler-worker`) and one program
 * worker (`@hylo-lang/hylo-wasm/program-worker`), shared by every playground on the page, and each
 * created only when first needed, since loading the compiler means downloading it whole.
 * `page-compiler.ts` holds the page's.
 *
 * Requests are served one at a time, so that one taking too long can be told apart from those
 * waiting behind it, and wait in the page until the compiler is ready, so that one dropped
 * meanwhile is never compiled. The compiler worker compiles a request and hands its executable
 * over to the program worker, which runs it; a program that runs too long, or whose result is no longer
 * wanted, is stopped by terminating the program worker, which costs nothing, while the compiler
 * stays loaded. Each stage of a request (see `stages.ts`) is reported as it ends, with what it
 * produced, so that a program that never returns still has its compilation shown.
 *
 * A compilation that takes too long terminates the compiler worker, and so does a compiler worker
 * that stops unexpectedly; the request is answered with what happened, and the next starts a new
 * worker. So does a compiler that fails to load, or stops making progress loading: every request
 * is then answered with the failure.
 *
 * Races are ruled out by construction rather than by timing:
 * - every request has an id, which the workers' messages about it carry, and a message is acted on
 *   only if it comes from the current worker and is about the request being served, so that
 *   nothing a terminated worker had already sent, or a request already answered, is mistaken for
 *   news of another;
 * - every request is settled once: answered, or dropped because its caller aborted it, after
 *   which nothing more of it reaches the caller;
 * - callers supersede their requests by aborting them (`AbortSignal`), rather than by checking
 *   for themselves which answer is the latest.
 */
import type {
  CompileRequest,
  Compilation,
  CompilerWorkerMessage,
  CompilerWorkerRequest,
  Execution,
  ProgramWorkerRequest,
  ProgramWorkerResult,
} from '@hylo-lang/hylo-wasm/protocol';
import { countErrors } from './diagnostics';
import { DEFAULT_TIME_LIMIT } from './settings';
import {
  plannedStages,
  stagesEnded,
  stagesInProgress,
  type RequestEnding,
  type Stage,
  type Stages,
} from './stages';

/**
 * A request's answer, or its progress: what compiling did, and what running did if it ran; or,
 * with what was compiled until then, why the request was not served to the end.
 */
export interface Result {
  /** Where the stages of the request stand; all settled in an answer. */
  stages: Stages;
  /** What compiling produced, so far in a request's progress. */
  compilation: Compilation;
  /** What running the program did, if it ran to the end. */
  execution: Execution | null;
  /**
   * Set iff a stage did not finish within its time limit, to that limit in seconds; the stage
   * stopped is the one `stages` reports as failed.
   */
  timedOut?: number;
  /** Set iff the compiler failed to load, to why. */
  compilerUnavailable?: string;
}

/** The state of the compiler a page is using. */
export type CompilerStatus =
  /** There is no compiler worker: none was needed yet, or the last one was terminated. */
  | { kind: 'idle' }
  /**
   * The compiler is downloading (`loaded` of `total` bytes, `total` being 0 when unknown), or
   * compiling its standard library once downloaded, or being replaced after it became unusable.
   */
  | { kind: 'loading'; loaded: number; total: number }
  /** The compiler is ready, its standard library compiled in `standardLibraryMilliseconds`. */
  | { kind: 'ready'; standardLibraryMilliseconds: number }
  /** The compiler failed to load, for the reason `error` gives; the next request tries again. */
  | { kind: 'failed'; error: string };

/** A function told the compiler's status. */
type StatusListener = (status: CompilerStatus) => void;

/** How a request is made; see `Compiler.compileAndRun`. */
export interface RequestOptions {
  /** Aborting it drops the request. */
  signal?: AbortSignal;
  /** Called with the request's progress whenever it changes, until it is settled. */
  onProgress?: (progress: Result) => void;
  /** How long each stage may take once the compiler is ready, in seconds. */
  timeLimit?: number;
}

/** The functions creating the workers a compiler uses. */
export interface WorkerFactories {
  /** Creates a worker running `@hylo-lang/hylo-wasm/compiler-worker`. */
  createCompilerWorker: () => Worker;
  /** Creates a worker running `@hylo-lang/hylo-wasm/program-worker`. */
  createProgramWorker: () => Worker;
}

/**
 * How long loading may go without progress: without a byte downloaded, or once downloaded,
 * without the standard library compiled.
 */
const LOADING_STALL_MILLISECONDS = 60_000;

/** A request waiting to be served, or being served. */
interface PendingRequest {
  /** The id the workers' messages about it carry. */
  id: number;
  request: CompileRequest;
  /** Settles the request with `result`, or `null` if it was aborted; only the first call counts. */
  settle: (result: Result | null) => void;
  /** Whether the request is settled, after which nothing more of it reaches the caller. */
  settled: boolean;
  onProgress?: (progress: Result) => void;
  /** How long each stage may take once the compiler is ready, in seconds. */
  timeLimit: number;
  /** The stages serving it takes. */
  plannedStages: Stage[];
  /** The last stage done, if any. */
  lastStageDone: Stage | null;
  /** What compiling it has produced so far, if anything. */
  compilation: Compilation | null;
}

/** What a request has produced before anything is compiled. */
const EMPTY_COMPILATION: Compilation = { diagnostics: [], artifacts: {}, milliseconds: 0 };

/** Returns how a request whose compilation is `compilation`, and which ran nothing, ended. */
function howCompilationEnded(compilation: Compilation): RequestEnding {
  if (compilation.error !== undefined) return 'failed';
  if (countErrors(compilation.diagnostics) > 0) return 'errors';
  return { ran: false };
}

/** Returns `true` iff `pending`'s program is running: compiling it is done, and nothing else is. */
const isRunning = (pending: PendingRequest): boolean => pending.lastStageDone === 'back-end';

/** A page's compiler; see the module's documentation. */
export class Compiler {
  #workerFactories: WorkerFactories;
  #compilerWorker: Worker | null = null;
  #programWorker: Worker | null = null;
  #status: CompilerStatus = { kind: 'idle' };
  #statusListeners = new Set<StatusListener>();
  /** The requests waiting to be served, oldest first. */
  #waiting: PendingRequest[] = [];
  /** The request being served, if any, settled or not. */
  #served: PendingRequest | null = null;
  /** The id of the last request made. */
  #lastRequestId = 0;
  /** The time limit of the current stage of the request served, while the compiler is ready. */
  #stageTimer: ReturnType<typeof setTimeout> | undefined;
  /** The time limit of loading's next progress, while the compiler is loading. */
  #loadingStallTimer: ReturnType<typeof setTimeout> | undefined;

  /** Creates a compiler whose workers `workerFactories` create, when they are needed. */
  constructor(workerFactories: WorkerFactories) {
    this.#workerFactories = workerFactories;
  }

  /**
   * Starts loading the compiler if it is not loading or loaded, so that it is ready sooner than
   * the first request would have it.
   */
  startLoading(): void {
    this.#ensureCompilerWorker();
  }

  /**
   * Calls `listener` with the status now and whenever it changes, until the returned function is
   * called.
   */
  watchStatus(listener: StatusListener): () => void {
    this.#statusListeners.add(listener);
    listener(this.#status);
    return () => this.#statusListeners.delete(listener);
  }

  /**
   * Compiles `request`, and runs the executable if one was requested and produced, starting the
   * workers needed.
   *
   * Resolves to the answer, which reports in `compilerUnavailable` a compiler that failed to
   * load, in `compilation.error` one that could not serve the request, and in `timedOut` a request
   * with a stage that took more than `timeLimit` seconds (`DEFAULT_TIME_LIMIT` by default) once
   * the compiler was ready; the last two keep what the stages done until then produced. Never
   * rejects.
   *
   * `onProgress`, if given, is called with the request's progress at once and whenever it changes
   * until the answer: when the compiler begins serving it, and when a stage ends, with what the
   * stages done produced.
   *
   * Aborting `signal` drops the request: it resolves to `null` at once, and `onProgress` is not
   * called again. A request still waiting, which includes one waiting for the compiler to load,
   * leaves the queue, and a program running is stopped at once; a compilation under way is let
   * finish, being short, but what it produces is ignored.
   */
  compileAndRun(
    request: CompileRequest,
    { signal, onProgress, timeLimit = DEFAULT_TIME_LIMIT }: RequestOptions = {},
  ): Promise<Result | null> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve(null);
        return;
      }
      const pending: PendingRequest = {
        id: ++this.#lastRequestId,
        request,
        settled: false,
        settle: (result) => {
          if (pending.settled) return;
          pending.settled = true;
          signal?.removeEventListener('abort', abort);
          resolve(result);
        },
        onProgress,
        timeLimit,
        plannedStages: plannedStages(request),
        lastStageDone: null,
        compilation: null,
      };
      const abort = (): void => this.#abort(pending);
      signal?.addEventListener('abort', abort, { once: true });
      this.#waiting.push(pending);
      this.#reportProgress(pending);
      this.#serveNext();
    });
  }

  /** Drops `pending`, as `compileAndRun` describes for an aborted request. */
  #abort(pending: PendingRequest): void {
    this.#waiting = this.#waiting.filter((waiting) => waiting !== pending);
    pending.settle(null);
    if (pending === this.#served && isRunning(pending)) {
      this.#terminateProgramWorker();
      this.#served = null;
      clearTimeout(this.#stageTimer);
      this.#serveNext();
    }
  }

  /**
   * Sends the oldest waiting request to the compiler worker, if there is one, none is served, and
   * the compiler is ready; otherwise starts loading the compiler, if a request waits for it.
   */
  #serveNext(): void {
    if (this.#served !== null || this.#waiting.length === 0) return;
    const worker = this.#ensureCompilerWorker();
    if (this.#status.kind !== 'ready') return;
    const pending = this.#waiting.shift()!;
    this.#served = pending;
    // The program, if any, is run by the program worker.
    const message: CompilerWorkerRequest = { id: pending.id, request: pending.request, run: false };
    worker.postMessage(message);
    this.#restartStageTimer();
    this.#reportProgress(pending);
  }

  /**
   * Calls the `onProgress` of `pending` with its progress, unless it is settled. It has begun iff
   * it is served, since a request is sent to the compiler only once the compiler is ready.
   */
  #reportProgress(pending: PendingRequest): void {
    if (pending.settled) return;
    const begun = pending === this.#served;
    pending.onProgress?.({
      compilation: pending.compilation ?? EMPTY_COMPILATION,
      execution: null,
      stages: stagesInProgress(pending.plannedStages, pending.lastStageDone, begun),
    });
  }

  /**
   * Starts, or starts again, the time limit of the current stage of the request served: once
   * reached, the worker serving it is terminated, and the request answered with `timedOut`.
   */
  #restartStageTimer(): void {
    clearTimeout(this.#stageTimer);
    const seconds = this.#served!.timeLimit;
    this.#stageTimer = setTimeout(() => {
      if (isRunning(this.#served!)) {
        this.#terminateProgramWorker();
      } else {
        this.#terminateCompilerWorker();
        this.#setStatus({ kind: 'idle' });
      }
      this.#answerServed((pending) => ({ ...this.#failedResult(pending), timedOut: seconds }));
    }, seconds * 1000);
  }

  /** Returns the answer to `pending`, which failed: what it produced until then. */
  #failedResult(pending: PendingRequest): Result {
    return {
      compilation: pending.compilation ?? EMPTY_COMPILATION,
      execution: null,
      stages: stagesEnded(pending.plannedStages, pending.lastStageDone, 'failed'),
    };
  }

  /** Starts, or starts again, the time limit of loading's next progress. */
  #restartLoadingStallTimer(): void {
    clearTimeout(this.#loadingStallTimer);
    this.#loadingStallTimer = setTimeout(() => {
      const seconds = LOADING_STALL_MILLISECONDS / 1000;
      this.#failLoading(`Loading the compiler made no progress for ${seconds} seconds.`);
    }, LOADING_STALL_MILLISECONDS);
  }

  /**
   * Answers the request served, if any, with `answer(it)` (dropped if the request is settled
   * already), and moves on to the next.
   */
  #answerServed(answer: (pending: PendingRequest) => Result): void {
    clearTimeout(this.#stageTimer);
    const pending = this.#served;
    this.#served = null;
    if (pending !== null) pending.settle(answer(pending));
    this.#serveNext();
  }

  /** Returns the compiler worker, starting it if there is none. */
  #ensureCompilerWorker(): Worker {
    if (this.#compilerWorker) return this.#compilerWorker;
    const worker = this.#workerFactories.createCompilerWorker();
    // What a worker that has since been terminated says is ignored.
    worker.onmessage = ({ data }: MessageEvent<CompilerWorkerMessage>) => {
      if (worker === this.#compilerWorker) this.#receiveFromCompiler(data);
    };
    worker.onerror = (event) => {
      if (worker !== this.#compilerWorker) return;
      // A worker that cannot even be fetched never posts `failed`.
      if (this.#status.kind !== 'ready') {
        this.#failLoading('The compiler is not available on this site.');
        return;
      }
      // One that was serving stopped unexpectedly: a new one serves the next request.
      this.#terminateCompilerWorker();
      this.#setStatus({ kind: 'idle' });
      this.#answerServedWithError(
        `the compiler stopped unexpectedly: ${event.message || 'no reason given'}`,
      );
    };
    this.#compilerWorker = worker;
    this.#markLoading(0, 0);
    return worker;
  }

  /** Returns the program worker, starting it if there is none. */
  #ensureProgramWorker(): Worker {
    if (this.#programWorker) return this.#programWorker;
    const worker = this.#workerFactories.createProgramWorker();
    worker.onmessage = ({ data }: MessageEvent<ProgramWorkerResult>) => {
      if (worker === this.#programWorker) this.#receiveFromProgram(data);
    };
    worker.onerror = (event) => {
      if (worker !== this.#programWorker) return;
      this.#terminateProgramWorker();
      // Only a request whose program it was running is answered; any other is being compiled.
      if (this.#served !== null && isRunning(this.#served)) {
        const reason = event.message || 'no reason given';
        this.#answerServedWithError(`the program could not be run: ${reason}`);
      }
    };
    this.#programWorker = worker;
    return worker;
  }

  /** Acts on `message`, from the current compiler worker. */
  #receiveFromCompiler(message: CompilerWorkerMessage): void {
    switch (message.type) {
      case 'progress':
        this.#markLoading(message.loaded, message.total);
        break;
      case 'ready':
        clearTimeout(this.#loadingStallTimer);
        this.#setStatus({
          kind: 'ready',
          standardLibraryMilliseconds: message.standardLibraryMilliseconds,
        });
        this.#serveNext();
        break;
      case 'failed':
        // The worker does not load the compiler again; a new worker will.
        this.#failLoading(message.error);
        break;
      case 'stage': {
        const pending = this.#served;
        if (pending === null || message.id !== pending.id) break;
        pending.lastStageDone = message.stage;
        pending.compilation = message.compilation;
        this.#restartStageTimer();
        this.#reportProgress(pending);
        break;
      }
      case 'result': {
        const pending = this.#served;
        if (pending === null || message.id !== pending.id) break;
        const { compilation, executable } = message;
        // The worker is replacing its compiler, and says `ready` once it has: the next request
        // begins then, and the time it takes does not count against it.
        if (compilation.compilerUnusable) this.#markLoading(0, 0);
        const runnable =
          executable !== undefined && compilation.error === undefined && !pending.settled;
        if (runnable && pending.plannedStages.includes('run')) {
          this.#run(pending, compilation, executable);
          break;
        }
        this.#answerServed(() => ({
          compilation,
          execution: null,
          stages: stagesEnded(
            pending.plannedStages,
            pending.lastStageDone,
            howCompilationEnded(compilation),
          ),
        }));
        break;
      }
    }
  }

  /**
   * Runs `executable`, which compiling `pending` produced as `compilation`, in the program worker.
   */
  #run(pending: PendingRequest, compilation: Compilation, executable: Uint8Array): void {
    pending.lastStageDone = 'back-end';
    pending.compilation = compilation;
    this.#restartStageTimer();
    this.#reportProgress(pending);
    const message: ProgramWorkerRequest = { id: pending.id, executable };
    // Handed over rather than copied.
    this.#ensureProgramWorker().postMessage(message, [executable.buffer]);
  }

  /** Acts on `result`, from the current program worker. */
  #receiveFromProgram(result: ProgramWorkerResult): void {
    const pending = this.#served;
    if (pending === null || !isRunning(pending) || result.id !== pending.id) return;
    if (result.type === 'failed') {
      this.#answerServedWithError(`the program could not be run: ${result.error}`);
      return;
    }
    const { execution } = result;
    this.#answerServed(() => ({
      compilation: pending.compilation!,
      execution,
      stages: stagesEnded(pending.plannedStages, 'back-end', { ran: true }),
    }));
  }

  /** Answers the request served, which failed for the reason `error` gives. */
  #answerServedWithError(error: string): void {
    this.#answerServed((pending) => {
      const result = this.#failedResult(pending);
      return { ...result, compilation: { ...result.compilation, error } };
    });
  }

  /** Records that the compiler is loading, having loaded `loaded` of `total` bytes. */
  #markLoading(loaded: number, total: number): void {
    this.#setStatus({ kind: 'loading', loaded, total });
    clearTimeout(this.#stageTimer);
    this.#restartLoadingStallTimer();
  }

  /**
   * Terminates the compiler worker, records that the compiler failed to load because of `error`,
   * and answers every request with it. The next request starts a new compiler worker.
   */
  #failLoading(error: string): void {
    if (this.#served !== null && isRunning(this.#served)) this.#terminateProgramWorker();
    this.#terminateCompilerWorker();
    this.#setStatus({ kind: 'failed', error });
    const unanswered = [...(this.#served ? [this.#served] : []), ...this.#waiting];
    this.#served = null;
    this.#waiting = [];
    for (const pending of unanswered) {
      pending.settle({ ...this.#failedResult(pending), compilerUnavailable: error });
    }
  }

  /** Terminates the compiler worker, if any, and stops the time limits. */
  #terminateCompilerWorker(): void {
    clearTimeout(this.#stageTimer);
    clearTimeout(this.#loadingStallTimer);
    this.#compilerWorker?.terminate();
    this.#compilerWorker = null;
  }

  /** Terminates the program worker, if any, stopping the program it runs. */
  #terminateProgramWorker(): void {
    this.#programWorker?.terminate();
    this.#programWorker = null;
  }

  /** Records `status` and tells the listeners. */
  #setStatus(status: CompilerStatus): void {
    this.#status = status;
    for (const listener of this.#statusListeners) listener(status);
  }
}
