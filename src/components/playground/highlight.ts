/**
 * Syntax highlighting for the playground: the grammars and themes the site's static code blocks
 * use (see `ec.config.mjs`), so that code looks the same whether it was rendered at build time or
 * by a playground.
 *
 * Loaded on first use. Shiki's JavaScript regular expression engine is used rather than
 * Oniguruma's, which would be another WebAssembly download; every grammar here is checked to
 * work with it, without its forgiving mode.
 */
import type { HighlighterCore } from 'shiki/core';
import hylo from '../../assets/syntax/hylo.tmLanguage.json';
import hyloIR from '../../assets/syntax/hylo-ir.tmLanguage.json';
import wasmAsm from '../../assets/syntax/wasm-asm.tmLanguage.json';

/** The site's code block themes, as configured by starlight-theme-rapide. */
export const THEMES = { light: 'vitesse-light', dark: 'vitesse-dark' } as const;

/** The highlighter, once something asked for it. */
let highlighter: Promise<HighlighterCore> | null = null;

/**
 * Returns the highlighter, with the site's themes and the grammars of Hylo, Hylo IR, LLVM IR and
 * WebAssembly assembly, creating it on first use. Rejects if a part of it fails to load.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]);
    return createHighlighterCore({
      engine: createJavaScriptRegexEngine({ forgiving: false }),
      themes: [import('shiki/themes/vitesse-light.mjs'), import('shiki/themes/vitesse-dark.mjs')],
      langs: [
        // The grammars' JSON is typed loosely; Shiki checks it as it loads it.
        hylo as never,
        hyloIR as never,
        wasmAsm as never,
        import('shiki/langs/llvm.mjs'),
      ],
    });
  })();
  return highlighter;
}

/**
 * Returns `code` highlighted as `lang`, one of the highlighter's languages, as HTML colouring
 * itself through the `--shiki-light` and `--shiki-dark` custom properties, so that the page's
 * theme decides which applies (see `playground.css`).
 */
export async function highlight(code: string, lang: string): Promise<string> {
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang, themes: THEMES, defaultColor: false });
}
