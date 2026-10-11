/**
 * The views of a request that a playground can show, as tabs, and how they are presented. (The
 * element showing the selected one is the panel.)
 */
import type { Artifact, Phase } from '@hylo-lang/hylo-wasm/protocol';

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

/**
 * Returns `true` iff a request whose compilation stops after `stopAfter`, or goes to the end if it
 * is `null`, can produce what `view` shows: the result and the diagnostics always, Hylo IR once
 * the code is lowered to it, and LLVM IR and WebAssembly only when compilation goes to the end.
 */
export function canProduce(view: View, stopAfter: Phase | null): boolean {
  switch (view) {
    case 'result':
    case 'diagnostics':
      return true;
    case 'raw-ir':
    case 'ir':
      return stopAfter === null || stopAfter === 'lowering';
    case 'llvm':
    case 'assembly':
      return stopAfter === null;
  }
}

/** Returns `true` iff `view` shows an artifact of the compiler. */
export function isArtifactView(view: View): view is Artifact {
  return view !== 'result' && view !== 'diagnostics';
}
