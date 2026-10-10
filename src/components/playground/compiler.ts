/**
 * The page's compiler: one worker (`@hylo-lang/hylo-wasm/worker`), shared by every playground on
 * the page, and created only when the first one asks for it, since loading it means downloading
 * the whole compiler.
 *
 * Requests are sent to the worker one at a time, so that one taking too long, such as a program
 * that never returns, can be told apart from those waiting behind it: the worker is then
 * terminated, the request answered with `gaveUp`, and a new worker started for the next one. A
 * worker whose compiler fails to load, or stops making progress loading it, is terminated too,
 * every request it had answered with the failure, and the next request starts a new one.
 */
import type {
  CompileRequest,
  WorkerMessage,
  WorkerRequest,
  WorkerResult,
} from '@hylo-lang/hylo-wasm/protocol';
import HyloWorker from '@hylo-lang/hylo-wasm/worker?worker';

/**
 * The answer to a request: what compiling did, and what running did if it ran; or, with nothing
 * compiled or run, why the request was not served.
 */
export interface Result extends Pick<WorkerResult, 'compile' | 'run'> {
  /** Set iff the page stopped waiting for the answer, to a sentence saying so. */
  gaveUp?: string;
  /** Set iff the compiler failed to load, to why. */
  unavailable?: string;
}

/** The state of the compiler a page is using. */
export type CompilerStatus =
  /** There is no worker: none was needed yet, or the last one was terminated. */
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
type Listener = (status: CompilerStatus) => void;

/** How long a request may take once the compiler is ready, compiling and running included. */
const REQUEST_TIMEOUT_MILLISECONDS = 20_000;

/**
 * How long loading may go without progress: without a byte downloaded, or once downloaded,
 * without the standard library compiled.
 */
const LOADING_STALL_MILLISECONDS = 60_000;

/** A request waiting for, or being served by, the worker. */
interface Pending {
  request: CompileRequest;
  /** Requests with the same key replace each other while they wait. */
  key?: string;
  /** Called once, with the answer, or with `null` if a newer request with the same key replaced it. */
  resolve: (r: Result | null) => void;
}

/** Returns a result with nothing compiled, reporting `error` if given. */
const nothing = (error?: string): Result => ({
  compile: { diagnostics: [], artifacts: {}, error, milliseconds: 0 },
  run: null,
});

/** The compiler of a page; see the module's documentation. */
class Compiler {
  #worker: Worker | null = null;
  #status: CompilerStatus = { kind: 'idle' };
  #listeners = new Set<Listener>();
  /** The requests waiting for the worker, oldest first. */
  #waiting: Pending[] = [];
  /** The request the worker is serving, if any. */
  #serving: Pending | null = null;
  /** The time limit of the request being served, while the compiler is ready. */
  #requestTimer: ReturnType<typeof setTimeout> | undefined;
  /** The time limit of loading's next progress, while the compiler is loading. */
  #loadingTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Starts loading the compiler if it is not loading or loaded, so that it is ready sooner than
   * the first request would have it.
   */
  start(): void {
    this.#start();
  }

  /**
   * Calls `listener` with the status now and whenever it changes, until the returned function is
   * called.
   */
  watch(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Compiles `request`, and runs the executable if one was requested and produced, starting the
   * worker if there is none.
   *
   * Resolves to the result, which reports in `unavailable` a compiler that failed to load, in
   * `compile.error` one that could not serve the request, and in `gaveUp` a request that took too
   * long. Never rejects. If
   * `key` is given, a later request with the same key replaces this one if it is still waiting,
   * and this one then resolves to `null`.
   */
  compile(request: CompileRequest, { key }: { key?: string } = {}): Promise<Result | null> {
    return new Promise((resolve) => {
      if (key !== undefined) {
        for (const p of this.#waiting.filter((p) => p.key === key)) p.resolve(null);
        this.#waiting = this.#waiting.filter((p) => p.key !== key);
      }
      this.#waiting.push({ request, key, resolve });
      this.#next();
    });
  }

  /** Sends the oldest waiting request to the worker, if there is one and the worker is free. */
  #next(): void {
    if (this.#serving !== null || this.#waiting.length === 0) return;
    const worker = this.#start();
    this.#serving = this.#waiting.shift()!;
    const message: WorkerRequest = { id: 0, request: this.#serving.request, run: true };
    worker.postMessage(message);
    // Otherwise the time limit starts once the compiler is ready.
    if (this.#status.kind === 'ready') this.#armRequestTimer();
  }

  /** Starts the time limit of the request being served. */
  #armRequestTimer(): void {
    clearTimeout(this.#requestTimer);
    this.#requestTimer = setTimeout(() => {
      this.#terminate();
      this.#set({ kind: 'idle' });
      const gaveUp = `Gave up after ${REQUEST_TIMEOUT_MILLISECONDS / 1000} seconds.`;
      this.#answer({ ...nothing(), gaveUp });
    }, REQUEST_TIMEOUT_MILLISECONDS);
  }

  /** Starts, or starts again, the time limit of loading's next progress. */
  #armLoadingTimer(): void {
    clearTimeout(this.#loadingTimer);
    this.#loadingTimer = setTimeout(() => {
      const seconds = LOADING_STALL_MILLISECONDS / 1000;
      this.#fail(`Loading the compiler made no progress for ${seconds} seconds.`);
    }, LOADING_STALL_MILLISECONDS);
  }

  /** Answers the request being served, if any, with `r`, and moves on to the next. */
  #answer(r: Result): void {
    clearTimeout(this.#requestTimer);
    const p = this.#serving;
    this.#serving = null;
    p?.resolve(r);
    this.#next();
  }

  /** Returns the worker, starting it if there is none. */
  #start(): Worker {
    if (this.#worker) return this.#worker;
    const w = new HyloWorker();
    w.onmessage = ({ data }: MessageEvent<WorkerMessage>) => this.#receive(data);
    // A worker that cannot even be fetched never posts `failed`.
    w.onerror = () => this.#fail('The compiler is not available on this site.');
    this.#worker = w;
    this.#loading(0, 0);
    return w;
  }

  /** Acts on `message`, from the worker. */
  #receive(message: WorkerMessage): void {
    switch (message.type) {
      case 'progress':
        this.#loading(message.loaded, message.total);
        break;
      case 'ready':
        clearTimeout(this.#loadingTimer);
        this.#set({ kind: 'ready', standardLibraryMilliseconds: message.standardLibraryMilliseconds });
        if (this.#serving !== null) this.#armRequestTimer();
        break;
      case 'failed':
        // The worker does not load the compiler again; a new worker will.
        this.#fail(message.error);
        break;
      case 'result':
        this.#answer({ compile: message.compile, run: message.run });
        // The worker is replacing its compiler, and says `ready` once it has. The time it takes
        // does not count against the next request.
        if (message.compile.compilerUnusable) this.#loading(0, 0);
        break;
    }
  }

  /** Records that the compiler is loading, having loaded `loaded` of `total` bytes. */
  #loading(loaded: number, total: number): void {
    this.#set({ kind: 'loading', loaded, total });
    clearTimeout(this.#requestTimer);
    this.#armLoadingTimer();
  }

  /**
   * Terminates the worker, records that the compiler failed to load because of `error`, and
   * answers every request with it. The next request starts a new worker.
   */
  #fail(error: string): void {
    this.#terminate();
    this.#set({ kind: 'failed', error });
    const pending = [...(this.#serving ? [this.#serving] : []), ...this.#waiting];
    this.#serving = null;
    this.#waiting = [];
    for (const p of pending) p.resolve({ ...nothing(), unavailable: error });
  }

  /** Terminates the worker, if any, and stops the time limits. */
  #terminate(): void {
    clearTimeout(this.#requestTimer);
    clearTimeout(this.#loadingTimer);
    this.#worker?.terminate();
    this.#worker = null;
  }

  /** Records `status` and tells the listeners. */
  #set(status: CompilerStatus): void {
    this.#status = status;
    for (const l of this.#listeners) l(status);
  }
}

/** The page's compiler. */
export const compiler = new Compiler();
