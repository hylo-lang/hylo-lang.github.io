/**
 * A plugin for Astro's Markdown processor, Sätteri, giving every `<Example>` in an MDX page the
 * MDX it wraps, as the author wrote it, as a `source` attribute, which `Example.astro` shows beside
 * what it renders. The source shown is so always the source rendered.
 *
 * The build fails, naming the page and the line, if an `<Example>` wraps nothing, or sets `source`
 * itself.
 */
import type { SatteriProcessorOptions } from '@astrojs/markdown-satteri';

/** A plugin, as `satteri({ mdastPlugins })` takes them. */
type MdastPlugin = NonNullable<SatteriProcessorOptions['mdastPlugins']>[number];

/** The name of the component this plugin gives its source to. */
const COMPONENT = 'Example';

/** Where a node is in the page, with offsets into its source. */
interface Position {
  start: { line: number; offset: number };
  end: { offset: number };
}

/**
 * Returns the MDX an element wraps, the element being at `position` in `source`: its text between
 * its opening and its closing tags, without the line breaks after the one and before the other.
 * (Not the span of its children, whose positions other plugins replacing them may drop.)
 */
export function wrappedSource(source: string, position: Position | undefined): string {
  if (!position) return '';
  const element = source.slice(position.start.offset, position.end.offset);
  const opening = /^<[^>]*>\r?\n?/.exec(element)?.[0] ?? '';
  const closing = /\r?\n?<\/[^>]*>$/.exec(element)?.[0] ?? '';
  return element.slice(opening.length, element.length - closing.length);
}

/** The plugin; see the module's documentation. */
export const exampleSource: MdastPlugin = {
  name: 'hylo:example-source',
  // The positions locate the MDX each example wraps in the page.
  options: { position: true },
  mdxJsxFlowElement(element, context) {
    if (element.name !== COMPONENT) return;
    const where = `${context.fileURL?.pathname ?? 'a page'}:${element.position?.start.line ?? '?'}`;
    const setsSource = element.attributes.some(
      (attribute) => attribute.type === 'mdxJsxAttribute' && attribute.name === 'source',
    );
    if (setsSource) throw new Error(`<${COMPONENT}> in ${where}: \`source\` is set from its contents`);
    // The source the positions are in: what is parsed, which a pipeline may have changed.
    const source = wrappedSource(context.source, element.position as Position | undefined);
    if (source.trim() === '') throw new Error(`<${COMPONENT}> in ${where}: wrap what to show`);
    // Replaced, keeping its children: Sätteri does not set the attributes of an element.
    return {
      ...element,
      attributes: [
        ...element.attributes,
        { type: 'mdxJsxAttribute' as const, name: 'source', value: source },
      ],
    };
  },
};
