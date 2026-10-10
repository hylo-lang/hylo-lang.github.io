/**
 * How the site colours code: the grammars of its languages and the themes, shared by the code
 * blocks rendered at build time (`ec.config.mjs`) and those the playground renders in the browser
 * (`src/components/playground/highlight.ts`), so that the two look the same.
 */
import ebnf from './ebnf.tmLanguage.json' with { type: 'json' };
import hyloIR from './hylo-ir.tmLanguage.json' with { type: 'json' };
import hylo from './hylo.tmLanguage.json' with { type: 'json' };
import wasmAsm from './wasm-asm.tmLanguage.json' with { type: 'json' };

/** The themes of code in the site's dark and light themes: those of starlight-theme-rapide. */
export const CODE_THEMES = { dark: 'vitesse-dark', light: 'vitesse-light' } as const;

/**
 * The TextMate grammars of the languages the site defines, beyond those Shiki has: Hylo, Hylo IR,
 * LLVM's WebAssembly assembly, and EBNF.
 */
export const GRAMMARS = [hylo, hyloIR, wasmAsm, ebnf];
