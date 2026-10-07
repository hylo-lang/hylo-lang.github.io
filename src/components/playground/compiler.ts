/**
 * The page's compiler: one worker, shared by every playground on the page, and created only when
 * the first one asks for it, since loading it means downloading the whole compiler.
 */
import type { CompileRequest, CompilerStatus, Result } from './protocol';

/** Where the build puts the compiler's release; see `scripts/fetch-compiler.ts`. */
export const COMPILER_BASE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}playground/compiler/`;

type Listener = (status: CompilerStatus) => void;

class Compiler {
  #worker: Worker | null = null;
  #status: CompilerStatus = { kind: 'idle' };
  #listeners = new Set<Listener>();
  #pending = new Map<number, (r: Result) => void>();
  #next = 0;

  get status(): CompilerStatus {
    return this.#status;
  }

  /** Calls `listener` with the status now and whenever it changes; returns how to stop. */
  watch(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  /** Compiles `request`, and runs the executable if one was requested and produced. */
  compile(request: CompileRequest): Promise<Result> {
    const worker = this.#start();
    const id = ++this.#next;
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      worker.postMessage({ id, request, run: true });
    });
  }

  #start(): Worker {
    if (this.#worker) return this.#worker;
    const w = new Worker(new URL('worker.mjs', new URL(COMPILER_BASE, location.href)), {
      type: 'module',
    });
    w.onmessage = ({ data }) => {
      switch (data.type) {
        case 'progress':
          this.#set({ kind: 'loading', loaded: data.loaded, total: data.total });
          break;
        case 'ready':
          this.#set({ kind: 'ready', standardLibraryMilliseconds: data.standardLibraryMilliseconds });
          break;
        case 'failed':
          this.#set({ kind: 'failed', error: data.error });
          break;
        case 'result':
          this.#pending.get(data.id)?.({ compile: data.compile, run: data.run });
          this.#pending.delete(data.id);
          break;
      }
    };
    // A worker that cannot even be fetched never posts `failed`, so the page says so itself.
    w.onerror = () => {
      this.#set({ kind: 'failed', error: 'The compiler is not available on this site.' });
      for (const resolve of this.#pending.values()) {
        resolve({ compile: { error: 'The compiler is not available on this site.' }, run: null });
      }
      this.#pending.clear();
    };
    this.#set({ kind: 'loading', loaded: 0, total: 0 });
    this.#worker = w;
    return w;
  }

  #set(status: CompilerStatus): void {
    this.#status = status;
    for (const l of this.#listeners) l(status);
  }
}

/** The page's compiler. */
export const compiler = new Compiler();
