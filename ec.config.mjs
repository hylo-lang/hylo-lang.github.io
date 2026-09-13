import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import * as fs from 'node:fs';
import { pluginErrorPreview } from './src/components/error-preview-plugin.ts';

/**
 * Expressive-code configuration.
 *
 * Starlight reads this file for both code fences and `<Code>`.
 */
export default defineEcConfig({
  defaultProps: { hangingIndent: 2 },
  shiki: {
    langs: [
      JSON.parse(fs.readFileSync('./src/assets/syntax/hylo.tmLanguage.json', 'utf-8')),
      JSON.parse(fs.readFileSync('./src/assets/syntax/ebnf.tmLanguage.json', 'utf-8')),
    ],
  },
  plugins: [pluginErrorPreview()],
});
