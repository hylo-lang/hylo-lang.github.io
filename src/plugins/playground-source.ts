/**
 * A plugin for Astro's Markdown processor, Sätteri, giving every `<Playground>` in an MDX page
 * the code it compiles, which `Playground.astro` requires: the code of the fence it shows, as a
 * `source` attribute, and the code it compiles without showing, as `prelude` and `epilogue`.
 *
 * The component itself only receives its slot rendered, by Expressive Code, as HTML; reading the
 * code back from that HTML would depend on how Expressive Code renders it. Here the code is still
 * the fences' text, as the author wrote it.
 *
 * A `<Playground>` wraps `hylo` code fences, exactly one of which is shown; the others say
 * `hidden` in their meta, and are compiled with it, in order, but not shown. A playground named
 * with `name="…"` can be continued by any later one on the page, with `continues="…"`: the later
 * one compiles all of the earlier one's code, hidden and shown, before its own.
 *
 * The build fails, naming the page and the line, if a `<Playground>` wraps anything else, shows
 * no fence or several, continues one that is not earlier on the page, reuses a name, or sets one
 * of the attributes this plugin sets.
 */
import type { SatteriProcessorOptions } from '@astrojs/markdown-satteri';
import { assembleProgram, type SnippetCode } from '../components/playground/snippet';

/** A plugin, as `satteri({ mdastPlugins })` takes them. */
type MdastPlugin = NonNullable<SatteriProcessorOptions['mdastPlugins']>[number];

/** The name of the component this plugin gives code to. */
const COMPONENT = 'Playground';

/** The attributes this plugin sets, which authors may not. */
const SET_ATTRIBUTES = ['source', 'prelude', 'epilogue'] as const;

/** The parts of an MDX tree this plugin reads; the rest it passes through untouched. */
interface Node {
  type: string;
  children?: Node[];
  position?: { start: { line: number; column: number } };
}

/** A code fence. */
interface Code extends Node {
  type: 'code';
  lang?: string | null;
  meta?: string | null;
  value: string;
}

/** A JSX element written as a block, such as `<Playground>`. */
interface Element extends Node {
  type: 'mdxJsxFlowElement';
  name: string | null;
  attributes: { type: string; name?: string; value?: unknown }[];
  children: Node[];
}

/** A `<Playground>` of a page, as this plugin understands it. */
export interface PlaygroundCode extends SnippetCode {
  /** The line of the page where it starts. */
  line: number;
  /** Its attributes written as strings, by name, other than those this plugin sets. */
  attributes: Record<string, string>;
  /** The fence it shows, which is all of its children it keeps. */
  fence: Code;
}

/** Returns whether `fence` is compiled but not shown: whether its meta says `hidden`. */
const isHidden = (fence: Code): boolean => /(?:^|\s)hidden(?:\s|$)/.test(fence.meta ?? '');

/** Returns a string identifying where `node` is in its page. */
const key = (node: Node): string => `${node.position?.start.line}:${node.position?.start.column}`;

/**
 * Returns the code of every `<Playground>` in `root`, the tree of the page `page`, keyed by where
 * it starts (see `key`).
 *
 * Throws if one is misused, as the module's documentation says, naming `page` and the line.
 */
export function collectPlaygrounds(root: Node, page: string): Map<string, PlaygroundCode> {
  const playgrounds = new Map<string, PlaygroundCode>();
  /** The whole program of each named playground seen so far, by name. */
  const programs = new Map<string, string>();

  const visit = (node: Node): void => {
    if (node.type === 'mdxJsxFlowElement' && (node as Element).name === COMPONENT) {
      const playground = read(node as Element, page, programs);
      playgrounds.set(key(node), playground);
      const name = playground.attributes.name;
      if (name !== undefined) programs.set(name, assembleProgram(playground));
      return;
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return playgrounds;
}

/**
 * Returns the code of `element`, a `<Playground>` of `page`, given the whole program of each
 * named playground before it.
 */
function read(element: Element, page: string, programs: Map<string, string>): PlaygroundCode {
  const line = element.position?.start.line ?? 0;
  const fail = (problem: string): never => {
    throw new Error(`<${COMPONENT}> in ${page}:${line || '?'}: ${problem}`);
  };

  const attributes: Record<string, string> = {};
  for (const attribute of element.attributes) {
    if (attribute.type !== 'mdxJsxAttribute' || attribute.name === undefined) continue;
    if ((SET_ATTRIBUTES as readonly string[]).includes(attribute.name)) {
      fail(`\`${attribute.name}\` is set from the code fences`);
    }
    if (typeof attribute.value === 'string') attributes[attribute.name] = attribute.value;
    else if (attribute.name === 'name' || attribute.name === 'continues') {
      fail(`write \`${attribute.name}\` as a string, such as \`${attribute.name}="counter"\``);
    } else if (attribute.value !== null && attribute.value !== undefined) {
      // An expression, such as `{2}`, kept as the text written between the braces.
      const text = (attribute.value as { value?: unknown }).value;
      if (typeof text === 'string') attributes[attribute.name] = text;
    }
  }

  const fences = element.children.map((child) =>
    child.type === 'code' && (child as Code).lang === 'hylo'
      ? (child as Code)
      : fail('wrap only `hylo` code fences'),
  );
  const shown = fences.findIndex((fence) => !isHidden(fence));
  if (shown === -1 || fences.slice(shown + 1).some((fence) => !isHidden(fence))) {
    fail('show exactly one code fence, marking the others `hidden`');
  }

  const continued = attributes.continues;
  const before = continued === undefined ? undefined : programs.get(continued);
  if (continued !== undefined && before === undefined) {
    fail(`\`continues="${continued}"\` names no \`<${COMPONENT}>\` earlier on the page`);
  }
  if (attributes.name !== undefined && programs.has(attributes.name)) {
    fail(`another \`<${COMPONENT}>\` of the page is named \`${attributes.name}\``);
  }

  const join = (parts: (string | undefined)[]) =>
    parts.filter((part) => part !== undefined).join('\n');
  return {
    line,
    attributes,
    fence: fences[shown],
    prelude: join([before, ...fences.slice(0, shown).map((fence) => fence.value)]),
    source: fences[shown].value,
    epilogue: join(fences.slice(shown + 1).map((fence) => fence.value)),
  };
}

/** The plugin; see the module's documentation. */
export const playgroundSource: MdastPlugin = (page) => {
  // Made for each page: what a page's playgrounds are is the page's own.
  let playgrounds = new Map<string, PlaygroundCode>();
  return {
    name: 'hylo:playground-source',
    // The positions name the line of a misused `<Playground>`, and tell playgrounds apart.
    options: { position: true },
    before(root) {
      playgrounds = collectPlaygrounds(root as Node, page.fileURL?.pathname ?? 'a page');
    },
    mdxJsxFlowElement(element) {
      const playground = element.name === COMPONENT ? playgrounds.get(key(element)) : undefined;
      if (playground === undefined) return;
      // Replaced, keeping only the fence shown: Sätteri does not set the attributes of an element.
      return {
        ...element,
        attributes: [
          ...element.attributes,
          ...SET_ATTRIBUTES.map((name) => ({
            type: 'mdxJsxAttribute' as const,
            name,
            value: playground[name],
          })),
        ],
        children: [playground.fence as (typeof element.children)[number]],
      };
    },
  };
};
