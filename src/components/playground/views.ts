/**
 * The views of a compilation that a playground can show, and how they are presented.
 */
import type { Artifact } from '@hylo-lang/hylo-wasm/protocol';

/**
 * A view of a compilation: `result`, what running it did and its diagnostics; `diagnostics`; or
 * a textual artifact of the compiler.
 */
export type Output = 'result' | 'diagnostics' | Artifact;

/** Every view, in the order a playground offers them. */
export const OUTPUTS = [
  'result',
  'diagnostics',
  'ir',
  'raw-ir',
  'llvm',
  'assembly',
] as const satisfies readonly Output[];

/** Fails to type-check unless `OUTPUTS` lists every view. */
const _everyOutputIsListed: [Exclude<Output, (typeof OUTPUTS)[number]>] extends [never]
  ? true
  : never = true;

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
