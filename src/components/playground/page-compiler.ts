/** The page's compiler (see `compiler.ts`), shared by every playground on the page. */
import CompilerWorker from '@hylo-lang/hylo-wasm/compiler-worker?worker';
import ProgramWorker from '@hylo-lang/hylo-wasm/program-worker?worker';
import { Compiler } from './compiler';

/** The page's compiler. */
export const compiler = new Compiler({
  createCompilerWorker: () => new CompilerWorker(),
  createProgramWorker: () => new ProgramWorker(),
});
