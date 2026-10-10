import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import { CODE_THEMES, GRAMMARS } from './src/assets/syntax/code-style.ts';
import { pluginErrorPreview } from './src/components/error-preview-plugin.ts';

/**
 * Expressive-code configuration.
 *
 * Starlight reads this file for both code fences and `<Code>`.
 */
export default defineEcConfig({
  defaultProps: { hangingIndent: 2 },
  // The theme's own, made explicit so that the playground can use the same.
  themes: [CODE_THEMES.dark, CODE_THEMES.light],
  shiki: {
    // The grammars' JSON is typed loosely; Shiki checks it as it loads it.
    langs: /** @type {any[]} */ (GRAMMARS),
  },
  plugins: [pluginErrorPreview()],
});
