/**
 * A Vite plugin turning Monaco's style sheets into styles the editor's code adds to the page when
 * it loads, rather than style sheets of their own.
 *
 * Monaco's modules import their CSS, and Astro links the CSS of every module a page's scripts may
 * load, dynamically imported or not, from the page's head. Every page with a snippet would then
 * wait for the editor's styles before rendering, although the editor is only loaded when a reader
 * edits a snippet.
 */
import type { ViteUserConfig } from 'astro';

/** A Vite plugin, named through Astro, which depends on Vite where the site does not. */
type Plugin = Extract<NonNullable<ViteUserConfig['plugins']>[number], { name: string }>;

/**
 * Ids of the modules injecting style sheets are the sheets' paths between these. Ids starting with a null character
 * are virtual modules by Vite's convention, and the extension keeps plugins processing CSS, which
 * go by the end of an id, from taking the module for a style sheet.
 */
const PREFIX = '\0hylo-injected-style:';
const SUFFIX = '.js';

export function injectMonacoStyles(): Plugin {
  return {
    name: 'hylo:inject-monaco-styles',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.endsWith('.css') || importer === undefined || options.ssr) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || !/[\\/]node_modules[\\/]monaco-editor[\\/].*\.css$/.test(resolved.id)) return null;
      return PREFIX + resolved.id + SUFFIX;
    },
    load(id) {
      if (!id.startsWith(PREFIX) || !id.endsWith(SUFFIX)) return null;
      // `?inline` has Vite process the style sheet (rewriting the URLs of fonts and the like) into
      // a string rather than a style sheet.
      const sheet = JSON.stringify(`${id.slice(PREFIX.length, -SUFFIX.length)}?inline`);
      return [
        `import css from ${sheet};`,
        `const style = document.createElement('style');`,
        `style.textContent = css;`,
        `document.head.append(style);`,
      ].join('\n');
    },
  };
}
