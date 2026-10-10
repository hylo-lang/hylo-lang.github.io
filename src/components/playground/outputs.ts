/**
 * How a playground shows what the compiler did: one function per view, each filling a container
 * from a `Result`, so that an embedded playground and the full-screen one show the same things.
 */
import type { Diagnostic } from '@hylo-lang/hylo-wasm/protocol';
import type { CompilerStatus, Result } from './compiler';
import { OUTPUT_LANGUAGES, type Output } from './views';

export interface RenderOptions {
  /**
   * The functions to show in Hylo IR, by name; all of them if empty. `main` shows `main`,
   * `factorial` shows `factorial(_:)`, and `Int32.infix+` shows that operator.
   */
  focus?: readonly string[];
  /** Called with a diagnostic's site when it is clicked. */
  onReveal?: (line: number, column: number) => void;
}

/** Fills `container` with the `output` view of `result`. */
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
    container.replaceChildren(
      ds.length > 0 ? diagnosticList(ds, options) : note('No diagnostics.'),
    );
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

/** Fills `container` with what the compiler is doing while it is not yet ready. */
export function renderStatus(container: HTMLElement, status: CompilerStatus): void {
  switch (status.kind) {
    case 'loading': {
      const p = note(
        status.total === 0
          ? 'Loading the compiler…'
          : status.loaded < status.total
            ? `Downloading the compiler… ${megabytes(status.loaded)} of ${megabytes(status.total)}`
            : 'Compiling the standard library…',
      );
      const bar = document.createElement('progress');
      if (status.total > 0) {
        bar.max = status.total;
        bar.value = status.loaded;
      }
      container.replaceChildren(p, bar);
      break;
    }
    case 'failed':
      container.replaceChildren(headline('bad', 'The compiler failed to load.'), note(status.error));
      break;
    default:
      container.replaceChildren();
  }
}

/**
 * Returns a sentence summing up `r`, for the status line that screen readers announce rather than
 * the whole view.
 */
export function summarize(r: Result): string {
  const c = r.compile;
  if (r.gaveUp) return r.gaveUp;
  if (c.error) return 'The compiler failed.';
  const errors = c.diagnostics.filter((d) => d.level === 'error').length;
  if (r.run === null) {
    return errors > 0 ? `Does not compile: ${errors} error${errors > 1 ? 's' : ''}.` : 'Compiles.';
  }
  return r.run.trap !== undefined ? 'The program trapped.' : `Exited with status ${r.run.exitCode}.`;
}

/** Returns a sentence describing `status`, or `null` once the compiler is ready. */
export function describeStatus(status: CompilerStatus): string | null {
  switch (status.kind) {
    case 'loading':
      return 'Loading the compiler…';
    case 'failed':
      return 'The compiler failed to load.';
    default:
      return null;
  }
}

/** The elements of the result view. */
function resultView(r: Result, options: RenderOptions): Node[] {
  const c = r.compile;
  if (r.gaveUp) {
    return [headline('warn', r.gaveUp), note('Does the program loop forever? It was stopped.')];
  }
  if (c.error) return [headline('bad', 'Internal error'), pre(c.error)];

  const errors = c.diagnostics.filter((d) => d.level === 'error');
  const nodes: Node[] = [];
  if (r.run === null) {
    nodes.push(
      errors.length > 0
        ? headline('bad', 'Does not compile')
        : headline('ok', 'Compiles'),
    );
    if (c.diagnostics.length > 0) nodes.push(diagnosticList(c.diagnostics, options));
    return nodes;
  }
  if (r.run.trap !== undefined) {
    nodes.push(headline('warn', 'The program trapped'));
  } else {
    nodes.push(headline(r.run.exitCode === 0 ? 'ok' : 'neutral', `Exited with status ${r.run.exitCode}`));
  }
  if (r.run.stdout) nodes.push(labelled('Standard output', pre(r.run.stdout)));
  if (r.run.stderr) nodes.push(labelled('Standard error', pre(r.run.stderr)));
  if (c.diagnostics.length > 0) nodes.push(diagnosticList(c.diagnostics, options));
  return nodes;
}

/**
 * A list of diagnostics, each shown as the compiler renders it, and taking the reader to its site
 * when clicked.
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
    if (options.onReveal) {
      button.addEventListener('click', () => options.onReveal!(d.site.line, d.site.column));
    } else {
      button.disabled = true;
    }
    item.append(button);
    list.append(item);
  }
  return list;
}

/** Returns why an artifact was not produced. */
function notProducedReason(r: Result): string {
  if (r.gaveUp) return `Not produced: ${r.gaveUp.toLowerCase()}`;
  if (r.compile.error) return 'Not produced: the compiler failed.';
  const failed = r.compile.diagnostics.some((d) => d.level === 'error');
  return failed ? 'Not produced: the program does not compile.' : 'Not produced.';
}

/**
 * Returns the functions of `ir`, Hylo IR, whose names are in `focus`, or all of `ir` if `focus` is
 * empty. Functions are separated by blank lines and begin with `fun <name>`.
 */
export function focusIR(ir: string, focus: readonly string[]): string {
  if (focus.length === 0) return ir;
  const shown = ir.split(/\n{2,}/).filter((f) => {
    const name = /^fun (\S+?)(?:<|\(|$)/.exec(f)?.[1];
    return name !== undefined && focus.some((n) => name === n || name.startsWith(`${n}(`));
  });
  return shown.length > 0 ? shown.join('\n\n') : ir;
}

function headline(tone: 'ok' | 'bad' | 'warn' | 'neutral', text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = `pg-headline pg-${tone}`;
  p.textContent = text;
  return p;
}

function note(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'pg-note';
  p.textContent = text;
  return p;
}

function pre(text: string): HTMLElement {
  const p = document.createElement('pre');
  p.className = 'pg-pre';
  p.textContent = text;
  return p;
}

function labelled(label: string, content: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  const h = document.createElement('h4');
  h.className = 'pg-label';
  h.textContent = label;
  section.append(h, content);
  return section;
}

function megabytes(n: number): string {
  return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
}
