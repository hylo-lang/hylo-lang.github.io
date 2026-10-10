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
import { CODE_THEMES, GRAMMARS } from '../../assets/syntax/code-style';

/** The highlighter, once something asked for it. */
let highlighter: Promise<HighlighterCore> | null = null;

/**
 * Returns the highlighter, with the site's themes and grammars (`code-style.ts`) and LLVM IR's,
 * creating it on first use. Rejects if a part of it fails to load.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, { bundledThemes }] =
      await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        // A map of the themes to functions loading them, each a chunk of its own.
        import('shiki/themes'),
      ]);
    return createHighlighterCore({
      engine: createJavaScriptRegexEngine({ forgiving: false }),
      themes: [bundledThemes[CODE_THEMES.light](), bundledThemes[CODE_THEMES.dark]()],
      langs: [
        // The grammars' JSON is typed loosely; Shiki checks it as it loads it.
        ...(GRAMMARS as never[]),
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
  return h.codeToHtml(code, { lang, themes: CODE_THEMES, defaultColor: false });
}
