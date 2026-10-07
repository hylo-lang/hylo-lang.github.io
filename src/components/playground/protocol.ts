/**
 * What the compiler's worker is asked and answers.
 *
 * The worker is `worker.mjs` from a hylo-new WebAssembly release (see
 * `Tools/wasm/js/worker.mjs` there); these types describe its messages.
 */

/** A view of a compilation that a playground can show. */
export type Output = 'result' | 'diagnostics' | 'raw-ir' | 'ir' | 'llvm' | 'assembly';

/** Every view, in the order a playground offers them. */
export const OUTPUTS: readonly Output[] = ['result', 'diagnostics', 'ir', 'raw-ir', 'llvm', 'assembly'];

/** What each view is called. */
export const OUTPUT_TITLES: Record<Output, string> = {
  result: 'Result',
  diagnostics: 'Diagnostics',
  ir: 'Hylo IR',
  'raw-ir': 'Raw Hylo IR',
  llvm: 'LLVM IR',
  assembly: 'WebAssembly',
};

/** The language each textual view is highlighted as. */
export const OUTPUT_LANGUAGES: Partial<Record<Output, string>> = {
  ir: 'hylo-ir',
  'raw-ir': 'hylo-ir',
  llvm: 'llvm',
  assembly: 'wasm-asm',
};

/** The compilation phase after which a request may stop. */
export type Phase = 'parsing' | 'scoping' | 'typing' | 'lowering';

/** A request to compile a program. */
export interface CompileRequest {
  source: string;
  emit: ('raw-ir' | 'ir' | 'llvm' | 'assembly' | 'executable')[];
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
  artifacts?: Partial<Record<'raw-ir' | 'ir' | 'llvm' | 'assembly', string>>;
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
}

/** The state of the compiler a page is using. */
export type CompilerStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; loaded: number; total: number }
  | { kind: 'ready'; standardLibraryMilliseconds: number }
  | { kind: 'failed'; error: string };
