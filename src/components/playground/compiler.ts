/**
 * The page's compiler: one worker, shared by every playground on the page, and created only when
 * the first one asks for it, since loading it means downloading the whole compiler.
 *
 * Requests are sent to the worker one at a time, so that one taking too long, such as a program
 * that never returns, can be told apart from those waiting behind it: the worker is then
 * terminated, the request answered with an error, and a new worker started for the next one.
 */
import type { CompileRequest, CompilerStatus, Result } from './protocol';
import { COMPILER_PATH } from './site';

type Listener = (status: CompilerStatus) => void;

/** How long a request may take once the compiler is ready, compiling and running included. */
const REQUEST_TIMEOUT_MILLISECONDS = 20_000;

/** A request waiting for, or being served by, the worker. */
interface Pending {
  request: CompileRequest;
  /** Requests with the same key replace each other while they wait. */
  key?: string;
  /** Called with the answer, or with `null` if a newer request with the same key replaced it. */
  resolve: (r: Result | null) => void;
}

/** Returns a result reporting `error`. */
const failure = (error: string): Result => ({ compile: { error }, run: null });

class Compiler {
  #worker: Worker | null = null;
  #status: CompilerStatus = { kind: 'idle' };
  #listeners = new Set<Listener>();
  #waiting: Pending[] = [];
  #serving: Pending | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  get status(): CompilerStatus {
    return this.#status;
  }

  /** Calls `listener` with the status now and whenever it changes; returns how to stop. */
  watch(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Compiles `request`, and runs the executable if one was requested and produced.
   *
   * If `key` is given, a later request with the same key replaces this one if it is still
   * waiting, and this one then resolves to `null`.
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

  /** Sends the next waiting request to the worker, if it is free. */
  #next(): void {
    if (this.#serving !== null || this.#waiting.length === 0) return;
    const worker = this.#start();
    this.#serving = this.#waiting.shift()!;
    worker.postMessage({ id: 0, request: this.#serving.request, run: true });
    if (this.#status.kind === 'ready') this.#arm();
  }

  /** Starts the time limit of the request being served. */
  #arm(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#stop();
      const gaveUp = `Gave up after ${REQUEST_TIMEOUT_MILLISECONDS / 1000} seconds.`;
      this.#answer({ compile: {}, run: null, gaveUp });
    }, REQUEST_TIMEOUT_MILLISECONDS);
  }

  /** Answers the request being served with `r`, and moves on to the next. */
  #answer(r: Result): void {
    clearTimeout(this.#timer);
    const p = this.#serving;
    this.#serving = null;
    p?.resolve(r);
    this.#next();
  }

  #start(): Worker {
    if (this.#worker) return this.#worker;
    const w = new Worker(new URL('worker.mjs', new URL(COMPILER_PATH, location.href)), {
      type: 'module',
    });
    w.onmessage = ({ data }) => {
      switch (data.type) {
        case 'progress':
          this.#set({ kind: 'loading', loaded: data.loaded, total: data.total });
          break;
        case 'ready':
          this.#set({ kind: 'ready', standardLibraryMilliseconds: data.standardLibraryMilliseconds });
          if (this.#serving !== null) this.#arm();
          break;
        case 'failed':
          this.#set({ kind: 'failed', error: data.error });
          break;
        case 'result':
          this.#answer({ compile: data.compile, run: data.run });
          break;
      }
    };
    // A worker that cannot even be fetched never posts `failed`, so the page says so itself, and
    // tries again from scratch on the next request.
    w.onerror = () => {
      const error = 'The compiler is not available on this site.';
      this.#stop();
      this.#set({ kind: 'failed', error });
      for (const p of this.#waiting) p.resolve(failure(error));
      this.#waiting = [];
      this.#answer(failure(error));
    };
    this.#set({ kind: 'loading', loaded: 0, total: 0 });
    this.#worker = w;
    return w;
  }

  /** Terminates the worker; the next request starts a new one. */
  #stop(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#set({ kind: 'idle' });
  }

  #set(status: CompilerStatus): void {
    this.#status = status;
    for (const l of this.#listeners) l(status);
  }
}

/** The page's compiler. */
export const compiler = new Compiler();
