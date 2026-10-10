/**
 * A plugin for Astro's Markdown processor, Sätteri, giving every `<Playground>` in an MDX page
 * the code of the fence it wraps, as a `source` attribute, which `Playground.astro` requires.
 *
 * The component itself only receives its slot rendered, by Expressive Code, as HTML; reading the
 * code back from that HTML would depend on how Expressive Code renders it. Here the code is still
 * the fence's text, as the author wrote it.
 *
 * The build fails, naming the page and the line, if a `<Playground>` wraps anything but exactly one
 * `hylo` code fence, or sets `source` itself.
 */
import type { SatteriProcessorOptions } from '@astrojs/markdown-satteri';

/** A plugin, as `satteri({ mdastPlugins })` takes them. */
type MdastPlugin = NonNullable<SatteriProcessorOptions['mdastPlugins']>[number];

/** The name of the component this plugin gives code to. */
const COMPONENT = 'Playground';

/** The plugin; see the module's documentation. */
export const playgroundSource: MdastPlugin = {
  name: 'hylo:playground-source',
  // The positions name the line of a misused `<Playground>`.
  options: { position: true },
  mdxJsxFlowElement(element, context) {
    if (element.name !== COMPONENT) return;
    const where = `${context.fileURL?.pathname ?? 'a page'}:${element.position?.start.line ?? '?'}`;
    const [fence, ...rest] = element.children;
    if (fence?.type !== 'code' || fence.lang !== 'hylo' || rest.length > 0) {
      throw new Error(`<${COMPONENT}> in ${where}: wrap exactly one \`hylo\` code fence`);
    }
    if (element.attributes.some((a) => a.type === 'mdxJsxAttribute' && a.name === 'source')) {
      throw new Error(`<${COMPONENT}> in ${where}: \`source\` is set from the code fence`);
    }
    // Replaced, keeping its children: Sätteri does not set the attributes of an element.
    return {
      ...element,
      attributes: [
        ...element.attributes,
        { type: 'mdxJsxAttribute', name: 'source', value: fence.value },
      ],
    };
  },
};
