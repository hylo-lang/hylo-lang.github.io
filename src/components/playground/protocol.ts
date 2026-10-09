/**
 * What the compiler's worker is asked and answers.
 *
 * The worker is `worker.mjs` from a hylo-new WebAssembly release (see
 * `Sources/WASM/js/src/worker.ts` and `protocol.ts` there); these types describe its messages.
 */

/** A textual artifact the compiler can produce. */
export type Artifact = 'raw-ir' | 'ir' | 'llvm' | 'assembly';

/** The compilation phase after which a request may stop. */
export type Phase = 'parsing' | 'scoping' | 'typing' | 'lowering';

/** A request to compile a program. */
export interface CompileRequest {
  source: string;
  emit: (Artifact | 'executable')[];
  optimization?: number;
  standardLibrary?: boolean;
  stopAfter?: Phase;
}

/** An issue the compiler found, at 1-based lines and UTF-16 columns. */
export interface Diagnostic {
  level: 'error' | 'warning' | 'note';
  message: string;
  rendered: string;
  site: { line: number; column: number; endLine: number; endColumn: number };
}

/** What compiling a request produced. */
export interface Compilation {
  diagnostics?: Diagnostic[];
  artifacts?: Partial<Record<Artifact, string>>;
  /** Set instead of the rest when the compiler could not serve the request at all. */
  error?: string;
  milliseconds?: number;
  executableBytes?: number;
}

/** What running the executable did. */
export interface Execution {
  exitCode: number | null;
  /** Set iff the program trapped, to the trap's message. */
  trap?: string;
  stdout: string;
  stderr: string;
}

/** The answer to a request: what compiling did, and what running did if it ran. */
export interface Result {
  compile: Compilation;
  run: Execution | null;
  /** Set iff the page stopped waiting for the answer, to a sentence saying so. */
  gaveUp?: string;
}

/** The state of the compiler a page is using. */
export type CompilerStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; loaded: number; total: number }
  | { kind: 'ready'; standardLibraryMilliseconds: number }
  | { kind: 'failed'; error: string };
