/**
 * How a playground shows what the compiler did: one function per view, each filling a container
 * from a `Result`, so that an embedded playground and the full-screen one show the same things.
 */
import type { Diagnostic } from '@hylo-lang/hylo-wasm/protocol';
import type { CompilerStatus, Result } from './compiler';
import { MAIN_FILE } from './settings';
import { OUTPUT_LANGUAGES, type Output } from './views';

/** The sentence saying the compiler failed to load. */
const FAILED_TO_LOAD = 'The compiler failed to load.';

/** How the views of a result are shown. */
export interface RenderOptions {
  /**
   * The functions to show in Hylo IR, by name; all of them if empty or absent. `main` shows
   * `main`, `factorial` shows `factorial(_:)`, and `Int32.infix+` shows that operator.
   */
  focus?: readonly string[];
  /**
   * Called with the 1-based line and column of a diagnostic in the code (`MAIN_FILE`) when the
   * reader clicks it; if absent, diagnostics cannot be clicked.
   */
  onReveal?: (line: number, column: number) => void;
}

/**
 * Replaces the contents of `container` with the `output` view of `result`.
 *
 * Resolves once they are replaced, which for a textual artifact takes loading the highlighter
 * the first time. Rendering a view again before the last resolved is allowed; the caller decides
 * which rendering to keep, by rendering into a detached element.
 */
export async function renderOutput(
  container: HTMLElement,
  output: Output,
  result: Result,
  options: RenderOptions = {},
): Promise<void> {
  if (output === 'result') {
    container.replaceChildren(...resultView(result, options));
  } else if (output === 'diagnostics') {
    const ds = result.compile.diagnostics;
    container.replaceChildren(ds.length > 0 ? diagnosticList(ds, options) : note('No diagnostics.'));
  } else {
    const text = result.compile.artifacts[output];
    if (text === undefined) {
      container.replaceChildren(note(notProducedReason(result)));
      return;
    }
    const shown = output === 'ir' || output === 'raw-ir' ? focusIR(text, options.focus ?? []) : text;
    // The highlighter is only loaded by the first view that needs it.
    const { highlight } = await import('./highlight');
    const code = document.createElement('div');
    code.className = 'pg-code';
    code.innerHTML = await highlight(shown, OUTPUT_LANGUAGES[output]);
    container.replaceChildren(code);
  }
}

/**
 * Shows what the compiler is doing in `container`: progress while it loads, the reason it failed
 * to, and nothing otherwise. Progress updates the elements it last showed in place.
 */
export function renderStatus(container: HTMLElement, status: CompilerStatus): void {
  switch (status.kind) {
    case 'loading': {
      let [p, bar] = container.children;
      if (container.children.length !== 2 || !(bar instanceof HTMLProgressElement)) {
        p = note('');
        bar = document.createElement('progress');
        container.replaceChildren(p, bar);
      }
      const progress = bar as HTMLProgressElement;
      p.textContent =
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
      container.replaceChildren(headline('bad', FAILED_TO_LOAD), note(status.error));
      break;
    default:
      container.replaceChildren();
  }
}

/** What can be watched for the compiler's status: the page's compiler. */
interface StatusSource {
  watch(listener: (status: CompilerStatus) => void): () => void;
}

/**
 * Shows `compiler`'s status in `view` and announces it in `status` whenever it changes, while it
 * is not ready and `relevant` returns `true`, until the returned function is called. Changes are
 * shown at most once a frame, since the download reports progress for every chunk.
 */
export function watchStatus(
  compiler: StatusSource,
  view: HTMLElement,
  status: HTMLElement,
  relevant: () => boolean = () => true,
): () => void {
  let latest: CompilerStatus | null = null;
  let frame = 0;
  const unwatch = compiler.watch((s) => {
    if (s.kind === 'ready' || !relevant()) return;
    latest = s;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (latest === null) return;
      renderStatus(view, latest);
      const sentence = describeStatus(latest) ?? '';
      // Rewriting a live region with the same text would announce it again.
      if (status.textContent !== sentence) status.textContent = sentence;
    });
  });
  return () => {
    cancelAnimationFrame(frame);
    unwatch();
  };
}

/**
 * Returns a sentence saying why `r` holds nothing compiled, if the request was not served: the
 * compiler failed to load, the page gave up waiting, or the compiler failed.
 */
export function failure(r: Result): string | undefined {
  if (r.unavailable !== undefined) return FAILED_TO_LOAD;
  if (r.gaveUp) return r.gaveUp;
  if (r.compile.error) return 'The compiler failed.';
  return undefined;
}

/** Returns how many of `ds` are errors. */
export function errorCount(ds: readonly Diagnostic[]): number {
  return ds.filter((d) => d.level === 'error').length;
}

/**
 * Returns a sentence summing up `r`, for the status line that screen readers announce rather than
 * the whole view.
 */
export function summarize(r: Result): string {
  const failed = failure(r);
  if (failed !== undefined) return failed;
  const errors = errorCount(r.compile.diagnostics);
  if (r.run === null) {
    return errors > 0 ? `${errors} error${errors > 1 ? 's' : ''}.` : 'Compiles.';
  }
  return r.run.trap !== undefined ? 'The program trapped.' : `Exited with status ${r.run.exitCode}.`;
}

/** Returns a sentence describing `status`, or `null` if there is nothing to say about it. */
export function describeStatus(status: CompilerStatus): string | null {
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
export function note(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'pg-note';
  p.textContent = text;
  return p;
}

/**
 * Returns the functions of `ir`, Hylo IR, whose names are in `focus` (see `RenderOptions.focus`),
 * or all of `ir` if `focus` is empty or names none of them. Functions are separated by blank
 * lines and begin with `fun <name>`.
 */
export function focusIR(ir: string, focus: readonly string[]): string {
  if (focus.length === 0) return ir;
  const shown = ir.split(/\n{2,}/).filter((f) => {
    const name = /^fun (\S+?)(?:<|\(|$)/.exec(f)?.[1];
    return name !== undefined && focus.some((n) => name === n || name.startsWith(`${n}(`));
  });
  return shown.length > 0 ? shown.join('\n\n') : ir;
}

/** Returns the elements of the result view of `r`. */
function resultView(r: Result, options: RenderOptions): Node[] {
  const c = r.compile;
  if (r.unavailable !== undefined) return [headline('bad', FAILED_TO_LOAD), note(r.unavailable)];
  if (r.gaveUp) {
    return [headline('warn', r.gaveUp), note('Does the program loop forever? It was stopped.')];
  }
  if (c.error) return [headline('bad', 'Internal error'), pre(c.error)];

  const nodes: Node[] = [];
  if (r.run === null) {
    // Errors speak for themselves; only their absence needs saying.
    if (errorCount(c.diagnostics) === 0) nodes.push(headline('ok', 'Compiles'));
    if (c.diagnostics.length > 0) nodes.push(diagnosticList(c.diagnostics, options));
    return nodes;
  }
  if (r.run.trap !== undefined) {
    nodes.push(headline('warn', 'The program trapped'));
  } else {
    const tone = r.run.exitCode === 0 ? 'ok' : 'neutral';
    nodes.push(headline(tone, `Exited with status ${r.run.exitCode}`));
  }
  if (r.run.stdout) nodes.push(labelled('Standard output', pre(r.run.stdout)));
  if (r.run.stderr) nodes.push(labelled('Standard error', pre(r.run.stderr)));
  if (c.diagnostics.length > 0) nodes.push(diagnosticList(c.diagnostics, options));
  return nodes;
}

/**
 * Returns a list of `ds`, each shown as the compiler renders it; one in the code takes the reader
 * to its site when clicked, if `options.onReveal` is given.
 */
function diagnosticList(ds: readonly Diagnostic[], options: RenderOptions): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'pg-diagnostics';
  for (const d of ds) {
    const item = document.createElement('li');
    item.dataset.level = d.level;
    const button = document.createElement('button');
    button.type = 'button';
    button.append(pre(d.rendered.replace(/\n$/, '')));
    const reveal = options.onReveal;
    // A site in another file, the standard library's, is nowhere in the editor.
    if (reveal && d.file === MAIN_FILE) {
      button.addEventListener('click', () => reveal(d.site.line, d.site.column));
    } else {
      button.disabled = true;
    }
    item.append(button);
    list.append(item);
  }
  return list;
}

/** Returns a sentence saying why `r` has no artifact of a view that asked for one. */
function notProducedReason(r: Result): string {
  const failed = failure(r);
  if (failed !== undefined) return `Not produced: ${failed[0].toLowerCase()}${failed.slice(1)}`;
  return errorCount(r.compile.diagnostics) > 0
    ? 'Not produced: the program has errors.'
    : 'Not produced.';
}

/** Returns a paragraph stating `text` in the colour of `tone`. */
function headline(tone: 'ok' | 'bad' | 'warn' | 'neutral', text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = `pg-headline pg-${tone}`;
  p.textContent = text;
  return p;
}

/** Returns a preformatted block of `text`. */
function pre(text: string): HTMLElement {
  const p = document.createElement('pre');
  p.className = 'pg-pre';
  p.textContent = text;
  return p;
}

/** Returns a section holding `content` under the heading `label`. */
function labelled(label: string, content: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  const h = document.createElement('h4');
  h.className = 'pg-label';
  h.textContent = label;
  section.append(h, content);
  return section;
}

/** Returns `n` bytes in megabytes, to one decimal below 10 MB and none above. */
function megabytes(n: number): string {
  return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
}
