/**
 * A plugin for Astro's Markdown processor, Sätteri, giving every `<Playground>` in an MDX page
 * the code it compiles, which `Playground.astro` requires: the files of its program, and in which
 * of them, between what code, is the code it shows.
 *
 * The component itself only receives its slot rendered, by Expressive Code, as HTML; reading the
 * code back from that HTML would depend on how Expressive Code renders it. Here the code is still
 * the fences' text, as the author wrote it.
 *
 * A `<Playground>` wraps `hylo` code fences. Each goes into a file of the program: the one its
 * `file` names, such as `file="point.hylo"`, which the code block does not show; or else the one
 * its `title` names, which the code block shows as its caption; or else the snippet's own, which
 * every fence of the snippet naming no file shares. A fence with a `file` may have a `title` that
 * is any caption. A fence adds its code at the end of its file, so fences of the
 * same file build it up in order. The fences that say `hidden` in their meta are compiled but not
 * shown; the others are shown, at most one of each file, as tabs if there are several, which keep
 * only the fences shown as the playground's children.
 *
 * A playground named with `name="…"` can be continued by any later one on the page, with
 * `continues="…"`: the later one starts from all the files of the earlier one, hidden code
 * included, and its fences continue the files they name. One with `contributes={false}` still
 * starts from what it continues, but a playground continuing it starts from that alone, without
 * its own code: a mistake or a digression can build on a program without changing it.
 *
 * The snippet's own file is called `main.hylo`, or `main2.hylo`, `main3.hylo` and so on: the first
 * of these that neither the program it continues nor one of its fences names already.
 *
 * The build fails, naming the page and the line, if a `<Playground>` wraps anything else, shows
 * no fence or two of the same file, names a file that is not a `.hylo` file, continues one that is
 * not earlier on the page, reuses a name, or sets one of the attributes this plugin sets.
 */
import type { SatteriProcessorOptions } from '@astrojs/markdown-satteri';
import {
  joinLines,
  type ShownFile,
  type SnippetCode,
} from '../components/playground/snippet';
import { freshFileName, isFileName } from '../components/playground/file-names';

/** A plugin, as `satteri({ mdastPlugins })` takes them. */
type MdastPlugin = NonNullable<SatteriProcessorOptions['mdastPlugins']>[number];

/** The name of the component this plugin gives code to. */
const COMPONENT = 'Playground';

/** The attributes this plugin sets, which authors may not, with how each is written. */
const SET_ATTRIBUTES = {
  files: (code: SnippetCode) => JSON.stringify(code.files),
  shown: (code: SnippetCode) => JSON.stringify(code.shown),
};

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

/** The files of a program, by name, in the order the compiler reads them, each as its parts. */
type Program = Map<string, string[]>;

/** A `<Playground>` of a page, as this plugin understands it. */
export interface PlaygroundCode extends SnippetCode {
  /** The line of the page where it starts. */
  line: number;
  /** Its attributes written as strings, by name, other than those this plugin sets. */
  attributes: Record<string, string>;
  /** The fences it shows, in order, which are all of its children it keeps. */
  fences: Code[];
}

/** Returns whether `fence` is compiled but not shown: whether its meta says `hidden`. */
const isHidden = (fence: Code): boolean => /(?:^|\s)hidden(?:\s|$)/.test(fence.meta ?? '');

/** Returns the value of the meta attribute `name` of `fence`, quoted either way, if it has one. */
const metaValue = (fence: Code, name: string): string | undefined =>
  new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`)
    .exec(fence.meta ?? '')
    ?.slice(1)
    .find((value) => value !== undefined);

/**
 * Returns the file `fence` names, and how: with its `file`, or else with its `title`; `undefined`
 * if it names none.
 */
function fileNameOf(fence: Code): { name: string; by: 'file' | 'title' } | undefined {
  const file = metaValue(fence, 'file');
  if (file !== undefined) return { name: file, by: 'file' };
  const title = metaValue(fence, 'title');
  return title === undefined ? undefined : { name: title, by: 'title' };
}

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
  /** The program a playground continuing each named one so far starts from, by name. */
  const continued = new Map<string, Program>();

  const visit = (node: Node): void => {
    if (node.type === 'mdxJsxFlowElement' && (node as Element).name === COMPONENT) {
      const { playground, program } = read(node as Element, page, continued);
      playgrounds.set(key(node), playground);
      const name = playground.attributes.name;
      if (name !== undefined) continued.set(name, program);
      return;
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return playgrounds;
}

/**
 * Returns the code of `element`, a `<Playground>` of `page`, given the program a playground
 * continuing each named one before it starts from, and the program one continuing it starts from.
 */
function read(
  element: Element,
  page: string,
  continued: ReadonlyMap<string, Program>,
): { playground: PlaygroundCode; program: Program } {
  const line = element.position?.start.line ?? 0;
  const fail = (problem: string): never => {
    throw new Error(`<${COMPONENT}> in ${page}:${line || '?'}: ${problem}`);
  };

  const attributes: Record<string, string> = {};
  for (const attribute of element.attributes) {
    if (attribute.type !== 'mdxJsxAttribute' || attribute.name === undefined) continue;
    if (attribute.name in SET_ATTRIBUTES) fail(`\`${attribute.name}\` is set from the code fences`);
    if (typeof attribute.value === 'string') attributes[attribute.name] = attribute.value;
    else if (attribute.name === 'name' || attribute.name === 'continues') {
      fail(`write \`${attribute.name}\` as a string, such as \`${attribute.name}="counter"\``);
    } else if (attribute.value !== null && attribute.value !== undefined) {
      // An expression, such as `{2}`, kept as the text written between the braces.
      const text = (attribute.value as { value?: unknown }).value;
      if (typeof text === 'string') attributes[attribute.name] = text.trim();
    }
  }
  if (!['true', 'false', undefined].includes(attributes.contributes)) {
    fail('write `contributes={false}`, or leave it out');
  }

  const fences = element.children.map((child) =>
    child.type === 'code' && (child as Code).lang === 'hylo'
      ? (child as Code)
      : fail('wrap only `hylo` code fences'),
  );
  if (fences.every(isHidden)) fail('show a code fence: they are all `hidden`');

  const name = attributes.continues;
  const before = name === undefined ? new Map() : continued.get(name);
  if (before === undefined) {
    fail(`\`continues="${name}"\` names no \`<${COMPONENT}>\` earlier on the page`);
  }
  if (attributes.name !== undefined && continued.has(attributes.name)) {
    fail(`another \`<${COMPONENT}>\` of the page is named \`${attributes.name}\``);
  }

  const named = fences.map(fileNameOf);
  for (const fileName of named) {
    if (fileName === undefined || isFileName(fileName.name)) continue;
    const { name, by } = fileName;
    fail(
      by === 'file'
        ? `\`file="${name}"\` does not name a \`.hylo\` file, such as \`file="point.hylo"\``
        : `\`title="${name}"\` does not name a \`.hylo\` file: name the file with \`file\`, ` +
            `such as \`file="point.hylo"\`, for a title that is not its name`,
    );
  }
  const names = named.map((fileName) => fileName?.name);
  const taken = new Set([...before!.keys(), ...names.filter((n) => n !== undefined)]);
  const ownFile = freshFileName(taken);
  const files = fences.map((_, i) => names[i] ?? ownFile);

  // The program, built up fence by fence. A shown file's code before its shown fence is its
  // prelude, and what hidden fences add to it after, its epilogue.
  const program: Program = new Map([...before!].map(([f, parts]) => [f, [...parts]]));
  /** Where each shown fence is among the parts of its file, by file. */
  const shownPart = new Map<string, number>();
  for (const [i, fence] of fences.entries()) {
    if (!program.has(files[i])) program.set(files[i], []);
    const parts = program.get(files[i])!;
    if (!isHidden(fence)) {
      if (shownPart.has(files[i])) fail(`show one code fence of \`${files[i]}\`, not several`);
      shownPart.set(files[i], parts.length);
    }
    parts.push(fence.value);
  }
  const shown = [...shownPart].map(([file, k]): ShownFile => {
    const parts = program.get(file)!;
    return {
      file,
      prelude: joinLines(parts.slice(0, k)),
      source: parts[k],
      epilogue: joinLines(parts.slice(k + 1)),
    };
  });

  return {
    playground: {
      line,
      attributes,
      fences: fences.filter((fence) => !isHidden(fence)),
      files: [...program].map(([f, parts]) => ({
        name: f,
        contents: shownPart.has(f) ? '' : joinLines(parts),
      })),
      shown,
    },
    program: attributes.contributes === 'false' ? before! : program,
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
      // Replaced, keeping only the fences shown: Sätteri does not set the attributes of an element.
      return {
        ...element,
        attributes: [
          ...element.attributes,
          ...Object.entries(SET_ATTRIBUTES).map(([name, write]) => ({
            type: 'mdxJsxAttribute' as const,
            name,
            value: write(playground),
          })),
        ],
        children: playground.fences as (typeof element.children)[number][],
      };
    },
  };
};
