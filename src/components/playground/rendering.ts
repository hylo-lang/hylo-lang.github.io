/**
 * How a playground shows what a request did: a function filling a panel with any view of a
 * `Result`, and the messages around it, so that a snippet and the full-screen playground show the
 * same things.
 */
import type { Diagnostic } from '@hylo-lang/hylo-wasm/protocol';
import type { CompilerStatus, Result } from './compiler';
import { countErrors } from './diagnostics';
import { VIEW_LANGUAGES, type View } from './views';

/** The sentence saying the compiler failed to load. */
const FAILED_TO_LOAD = 'The compiler failed to load.';

/** How the views of a result are shown. */
export interface RenderOptions {
  /**
   * The functions to show in Hylo IR, by name; all of them if empty or absent. `main` shows
   * `main`, `factorial` shows `factorial(_:)`, and `Int32.infix+` shows that operator.
   */
  irFunctions?: readonly string[];
  /**
   * Called with the 1-based line and column of a diagnostic when the reader clicks it; if absent,
   * diagnostics cannot be clicked.
   */
  onReveal?: (line: number, column: number) => void;
}

/**
 * Replaces the contents of `container` with the `view` of `result`.
 *
 * Resolves once they are replaced, which for a textual artifact takes loading the highlighter
 * the first time. Rendering a view again before the last resolved is allowed; the caller decides
 * which rendering to keep, by rendering into a detached element.
 */
export async function renderView(
  container: HTMLElement,
  view: View,
  result: Result,
  options: RenderOptions = {},
): Promise<void> {
  if (view === 'result') {
    container.replaceChildren(...resultView(result, options));
  } else if (view === 'diagnostics') {
    const diagnostics = result.compilation.diagnostics;
    container.replaceChildren(
      diagnostics.length > 0
        ? diagnosticList(diagnostics, options)
        : mutedParagraph('No diagnostics.'),
    );
  } else {
    const text = result.compilation.artifacts[view];
    if (text === undefined) {
      container.replaceChildren(mutedParagraph(whyNotProduced(result)));
      return;
    }
    const isIR = view === 'ir' || view === 'raw-ir';
    const shown = isIR ? filterIRFunctions(text, options.irFunctions ?? []) : text;
    // The highlighter is only loaded by the first view that needs it.
    const { highlight } = await import('./highlight');
    const code = document.createElement('div');
    code.className = 'pg-code';
    code.innerHTML = await highlight(shown, VIEW_LANGUAGES[view]);
    container.replaceChildren(code);
  }
}

/** A status of the compiler worth showing in place of a result: loading, or having failed to. */
type ShownCompilerStatus = Extract<CompilerStatus, { kind: 'loading' | 'failed' }>;

/**
 * Shows `status` in `container`: progress while the compiler loads, or the reason it failed to.
 * Progress updates the elements it last showed in place.
 */
export function renderCompilerStatus(container: HTMLElement, status: ShownCompilerStatus): void {
  switch (status.kind) {
    case 'loading': {
      let [sentence, bar] = container.children;
      if (container.children.length !== 2 || !(bar instanceof HTMLProgressElement)) {
        sentence = mutedParagraph('');
        bar = document.createElement('progress');
        container.replaceChildren(sentence, bar);
      }
      const progress = bar as HTMLProgressElement;
      sentence.textContent =
        status.total === 0
          ? 'Loading the compiler…'
          : status.loaded < status.total
            ? `Downloading the compiler… ${megabytes(status.loaded)} of ${megabytes(status.total)}`
            : 'Compiling the standard library…';
      // Without a total, the bar is indeterminate.
      if (status.total > 0) {
        progress.max = status.total;
        progress.value = status.loaded;
      } else {
        progress.removeAttribute('value');
      }
      break;
    }
    case 'failed':
      container.replaceChildren(headline('bad', FAILED_TO_LOAD), mutedParagraph(status.error));
      break;
  }
}

/** What can be watched for the compiler's status: the page's compiler. */
interface StatusSource {
  watchStatus(listener: (status: CompilerStatus) => void): () => void;
}

/** What shows the compiler's status: a playground's pane. */
interface StatusShower {
  showCompilerStatus(status: CompilerStatus): void;
  readonly isShowingResult: boolean;
}

/**
 * Tells `pane` the status of `compiler` whenever it changes, and announces it in `statusLine`
 * while the pane shows no result, until the returned function is called. Changes are passed on at
 * most once a frame, since the download reports progress for every chunk.
 */
export function showCompilerStatus(
  compiler: StatusSource,
  pane: StatusShower,
  statusLine: HTMLElement,
): () => void {
  let latest: CompilerStatus | null = null;
  let frame = 0;
  const stopWatching = compiler.watchStatus((status) => {
    latest = status;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (latest === null) return;
      pane.showCompilerStatus(latest);
      if (pane.isShowingResult) return;
      const sentence = describeCompilerStatus(latest) ?? '';
      // Rewriting a live region with the same text would announce it again.
      if (statusLine.textContent !== sentence) statusLine.textContent = sentence;
    });
  });
  return () => {
    cancelAnimationFrame(frame);
    stopWatching();
  };
}

/**
 * Returns a value equal for two results iff `renderView` shows their `view` the same: what that
 * view shows of them, as JSON.
 */
export function viewSignature(view: View, result: Result): string {
  const { compilation, execution, timedOut, compilerUnavailable, stages } = result;
  if (view === 'diagnostics') return JSON.stringify(compilation.diagnostics);
  if (view === 'result') {
    const { diagnostics, error } = compilation;
    const programTimedOut = stages.run === 'failed';
    return JSON.stringify({
      diagnostics,
      error,
      execution,
      timedOut,
      compilerUnavailable,
      programTimedOut,
    });
  }
  const failure = describeFailure(result);
  return JSON.stringify([compilation.artifacts[view], failure, countErrors(compilation.diagnostics)]);
}

/**
 * Returns a sentence saying why `result` was not served to the end, or `undefined` if it was: the
 * compiler failed to load, a stage took too long, or the compiler failed.
 */
export function describeFailure(result: Result): string | undefined {
  if (result.compilerUnavailable !== undefined) return FAILED_TO_LOAD;
  if (result.timedOut !== undefined) return `${timeLimitHeadline(result, result.timedOut)}.`;
  if (result.compilation.error) return 'The compiler failed.';
  return undefined;
}

/**
 * Returns a sentence summing up `result`, for the status line that screen readers announce rather
 * than the whole panel.
 */
export function summarize(result: Result): string {
  const failure = describeFailure(result);
  if (failure !== undefined) return failure;
  const errors = countErrors(result.compilation.diagnostics);
  const { execution } = result;
  if (execution === null) {
    return errors > 0 ? `${errors} error${errors > 1 ? 's' : ''}.` : 'Compiles.';
  }
  return execution.trap !== undefined
    ? 'The program trapped.'
    : `Exited with status ${execution.exitCode}.`;
}

/** Returns a sentence describing `status`, or `null` if there is nothing to say about it. */
export function describeCompilerStatus(status: CompilerStatus): string | null {
  switch (status.kind) {
    case 'loading':
      return 'Loading the compiler…';
    case 'failed':
      return FAILED_TO_LOAD;
    default:
      return null;
  }
}

/** Returns a paragraph of secondary text, `text`. */
export function mutedParagraph(text: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'pg-muted';
  paragraph.textContent = text;
  return paragraph;
}

/**
 * Returns the functions of `ir`, Hylo IR, named in `names` (see `RenderOptions.irFunctions`), or
 * all of `ir` if `names` is empty or names none of them. Functions are separated by blank lines
 * and begin with `fun <name>`.
 */
export function filterIRFunctions(ir: string, names: readonly string[]): string {
  if (names.length === 0) return ir;
  const shown = ir.split(/\n{2,}/).filter((definition) => {
    const name = /^fun (\S+?)(?:<|\(|$)/.exec(definition)?.[1];
    return name !== undefined && names.some((n) => name === n || name.startsWith(`${n}(`));
  });
  return shown.length > 0 ? shown.join('\n\n') : ir;
}

/** Returns the elements of the result view of `result`. */
function resultView(result: Result, options: RenderOptions): Node[] {
  const { compilation, execution } = result;
  const diagnostics = compilation.diagnostics;
  if (result.compilerUnavailable !== undefined) {
    return [headline('bad', FAILED_TO_LOAD), mutedParagraph(result.compilerUnavailable)];
  }
  if (result.timedOut !== undefined) {
    const nodes: Node[] = [headline('warn', timeLimitHeadline(result, result.timedOut))];
    if (diagnostics.length > 0) nodes.push(diagnosticList(diagnostics, options));
    return nodes;
  }
  if (compilation.error) {
    return [headline('bad', 'Internal error'), preformatted(compilation.error)];
  }

  const nodes: Node[] = [];
  if (execution === null) {
    // Errors speak for themselves; only their absence needs saying.
    if (countErrors(diagnostics) === 0) nodes.push(headline('ok', 'Compiles'));
    if (diagnostics.length > 0) nodes.push(diagnosticList(diagnostics, options));
    return nodes;
  }
  if (execution.trap !== undefined) {
    nodes.push(headline('warn', 'The program trapped'));
  } else {
    const tone = execution.exitCode === 0 ? 'ok' : 'neutral';
    nodes.push(headline(tone, `Exited with status ${execution.exitCode}`));
  }
  if (execution.stdout) {
    nodes.push(labelledSection('Standard output', preformatted(execution.stdout)));
  }
  if (execution.stderr) {
    nodes.push(labelledSection('Standard error', preformatted(execution.stderr)));
  }
  if (diagnostics.length > 0) nodes.push(diagnosticList(diagnostics, options));
  return nodes;
}

/**
 * Returns a list of `diagnostics`, each shown as the compiler renders it, notes included; one in
 * the code takes the reader to its site when clicked, if `options.onReveal` is given.
 */
function diagnosticList(diagnostics: readonly Diagnostic[], options: RenderOptions): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'pg-diagnostics';
  for (const diagnostic of diagnostics) {
    const item = document.createElement('li');
    item.dataset.level = diagnostic.level;
    const button = document.createElement('button');
    button.type = 'button';
    button.append(preformatted(diagnostic.rendered));
    const reveal = options.onReveal;
    if (reveal) {
      const { line, column } = diagnostic.site;
      button.addEventListener('click', () => reveal(line, column));
    } else {
      button.disabled = true;
    }
    item.append(button);
    list.append(item);
  }
  return list;
}

/** Returns a sentence saying why `result` has no artifact of a view that asked for one. */
function whyNotProduced(result: Result): string {
  const failure = describeFailure(result);
  if (failure !== undefined) return `Not produced: ${failure[0].toLowerCase()}${failure.slice(1)}`;
  return countErrors(result.compilation.diagnostics) > 0
    ? 'Not produced: the program has errors.'
    : 'Not produced.';
}

/**
 * Returns a headline saying that the stage of `result` it stopped, the program or compilation,
 * did not finish within `seconds`.
 */
function timeLimitHeadline(result: Result, seconds: number): string {
  const stopped = result.stages.run === 'failed' ? 'The program' : 'Compilation';
  return `${stopped} did not finish within ${seconds} second${seconds === 1 ? '' : 's'}`;
}

/** Returns a paragraph stating `text` in the colour of `tone`. */
function headline(tone: 'ok' | 'bad' | 'warn' | 'neutral', text: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = `pg-headline pg-${tone}`;
  paragraph.textContent = text;
  return paragraph;
}

/** Returns a preformatted block of `text`. */
function preformatted(text: string): HTMLElement {
  const block = document.createElement('pre');
  block.className = 'pg-pre';
  block.textContent = text;
  return block;
}

/** Returns a section holding `content` under the heading `label`. */
function labelledSection(label: string, content: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  const heading = document.createElement('h4');
  heading.className = 'pg-label';
  heading.textContent = label;
  section.append(heading, content);
  return section;
}

/** Returns `byteCount` in megabytes, to one decimal below 10 MB and none above. */
function megabytes(byteCount: number): string {
  return `${(byteCount / 1048576).toFixed(byteCount < 10 * 1048576 ? 1 : 0)} MB`;
}
