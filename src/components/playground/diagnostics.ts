/** What a playground counts of the compiler's diagnostics. */
import type { Diagnostic } from '@hylo-lang/hylo-wasm/protocol';

/** Returns how many of `diagnostics` are errors. */
export function countErrors(diagnostics: readonly Diagnostic[]): number {
  return diagnostics.filter((d) => d.level === 'error').length;
}
