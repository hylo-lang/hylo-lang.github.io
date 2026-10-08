/**
 * The views of a compilation that a playground can show, and how they are presented.
 */
import type { Artifact } from './protocol';

/** A view of a compilation. */
export type Output = 'result' | 'diagnostics' | Artifact;

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
export const OUTPUT_LANGUAGES: Record<Artifact, string> = {
  ir: 'hylo-ir',
  'raw-ir': 'hylo-ir',
  llvm: 'llvm',
  assembly: 'wasm-asm',
};

/** Returns `true` iff `o` is a view showing an artifact of the compiler. */
export function isArtifact(o: Output): o is Artifact {
  return o !== 'result' && o !== 'diagnostics';
}
