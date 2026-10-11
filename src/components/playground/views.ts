/**
 * The views of a request that a playground can show, as tabs, and how they are presented. (The
 * element showing the selected one is the panel.)
 */
import type { Artifact } from '@hylo-lang/hylo-wasm/protocol';

/**
 * A view of a request: `result`, what running the program did and the diagnostics;
 * `diagnostics`; or a textual artifact of the compiler.
 */
export type View = 'result' | 'diagnostics' | Artifact;

/** Every view, in the order a playground offers them. */
export const VIEWS = [
  'result',
  'diagnostics',
  'raw-ir',
  'ir',
  'llvm',
  'assembly',
] as const satisfies readonly View[];

/** Fails to type-check unless `VIEWS` lists every view. */
const _everyViewIsListed: [Exclude<View, (typeof VIEWS)[number]>] extends [never]
  ? true
  : never = true;

/** What each view is called. */
export const VIEW_TITLES: Record<View, string> = {
  result: 'Result',
  diagnostics: 'Diagnostics',
  ir: 'Hylo IR',
  'raw-ir': 'Raw Hylo IR',
  llvm: 'LLVM IR',
  assembly: 'WebAssembly',
};

/** The language each artifact's view is highlighted as. */
export const VIEW_LANGUAGES: Record<Artifact, string> = {
  ir: 'hylo-ir',
  'raw-ir': 'hylo-ir',
  llvm: 'llvm',
  assembly: 'wasm-asm',
};

/** Returns `true` iff `view` shows an artifact of the compiler. */
export function isArtifactView(view: View): view is Artifact {
  return view !== 'result' && view !== 'diagnostics';
}
