/**
 * `<hylo-playground>`: makes the code block inside it runnable and editable.
 *
 * Rendered by `Playground.astro`, which documents the attributes. The code block is whatever
 * Expressive Code rendered for the author's fence, and stays on the page until the reader edits
 * it, so a snippet looks like every other code block and works without JavaScript.
 */
import { compiler } from './compiler';
import { renderOutput, renderStatus } from './outputs';
import { OUTPUT_TITLES, type CompileRequest, type Output, type Phase, type Result } from './protocol';
import { playgroundURL } from './source-link';
import type { Editor } from './editor';

class HyloPlayground extends HTMLElement {
  #original = '';
  #editor: Editor | null = null;
  #result: Result | null = null;
  #shown: Output = 'result';
  #running = false;
  #unwatch: (() => void) | null = null;

  get #outputs(): Output[] {
    return (this.dataset.outputs ?? 'result').split(',') as Output[];
  }

  get #source(): string {
    return this.#editor?.value ?? this.#original;
  }

  connectedCallback(): void {
    this.#original = this.#readSource();
    this.#shown = this.#outputs[0];
    this.#part('run').addEventListener('click', () => void this.run());
    this.#part('edit').addEventListener('click', () => void this.edit());
    this.#part('reset').addEventListener('click', () => this.reset());
    this.#part('open').addEventListener('click', (e) => void this.#open(e));
    for (const tab of this.querySelectorAll<HTMLButtonElement>('[data-output]')) {
      tab.addEventListener('click', () => this.#show(tab.dataset.output as Output));
    }
    this.toggleAttribute('data-ready', true);
  }

  disconnectedCallback(): void {
    this.#unwatch?.();
    this.#editor?.dispose();
  }

  /** Compiles and runs the code, showing the configured outputs. */
  async run(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#part('run').toggleAttribute('aria-busy', true);
    const view = this.#part('view');
    this.#part('output').hidden = false;

    // Progress, until the compiler has answered.
    this.#unwatch = compiler.watch((s) => {
      if (s.kind !== 'ready') renderStatus(view, s);
    });
    this.#result = await compiler.compile(this.#request());
    this.#unwatch();
    this.#unwatch = null;

    this.#editor?.showDiagnostics(this.#result.compile.diagnostics ?? []);
    await this.#show(this.#shown);
    this.#part('run').removeAttribute('aria-busy');
    this.#running = false;
  }

  /** Replaces the code block by an editor holding the same code. */
  async edit(): Promise<void> {
    if (this.#editor) return this.#editor.focus();
    const { createEditor } = await import('./editor');
    const host = this.#part('editor');
    host.hidden = false;
    this.#editor = await createEditor(host, {
      value: this.#original,
      fitContent: true,
      onRun: () => void this.run(),
    });
    this.#part('source').hidden = true;
    this.#part('edit').hidden = true;
    this.#part('reset').hidden = false;
    this.#editor.focus();
  }

  /** Puts the original code block back. */
  reset(): void {
    this.#editor?.dispose();
    this.#editor = null;
    this.#part('editor').hidden = true;
    this.#part('editor').replaceChildren();
    this.#part('source').hidden = false;
    this.#part('edit').hidden = false;
    this.#part('reset').hidden = true;
    this.#part('output').hidden = true;
    this.#result = null;
  }

  #request(): CompileRequest {
    const stopAfter = (this.dataset.stopAfter || undefined) as Phase | undefined;
    const emit: CompileRequest['emit'] = this.#outputs.filter(
      (o): o is 'raw-ir' | 'ir' | 'llvm' | 'assembly' => o !== 'result' && o !== 'diagnostics',
    );
    if (!stopAfter) emit.push('executable');
    return {
      source: this.#source,
      emit,
      optimization: Number(this.dataset.optimization ?? 0),
      standardLibrary: this.dataset.standardLibrary !== 'false',
      stopAfter,
    };
  }

  async #show(output: Output): Promise<void> {
    this.#shown = output;
    for (const tab of this.querySelectorAll<HTMLButtonElement>('[data-output]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.output === output));
    }
    if (!this.#result) return;
    await renderOutput(this.#part('view'), output, this.#result, {
      focus: this.dataset.focus ? this.dataset.focus.split(',') : [],
      onReveal: (line, column) => void this.edit().then(() => this.#editor?.reveal(line, column)),
    });
    this.#part('view').setAttribute('aria-label', OUTPUT_TITLES[output]);
  }

  /** Opens the full-screen playground on the code as it is now. */
  async #open(e: MouseEvent): Promise<void> {
    const link = e.currentTarget as HTMLAnchorElement;
    e.preventDefault();
    const url = await playgroundURL(this.#source, Number(this.dataset.optimization ?? 0));
    if (e.ctrlKey || e.metaKey || e.button === 1) window.open(url, '_blank');
    else location.href = url;
    link.href = url;
  }

  /** The code of the block, as Expressive Code's copy button holds it. */
  #readSource(): string {
    const copy = this.querySelector<HTMLElement>('[data-code]');
    if (copy?.dataset.code !== undefined) {
      // Expressive Code stores line breaks as U+007F, since attributes normalise newlines away.
      return copy.dataset.code.replace(/\u007f/g, '\n');
    }
    const lines = this.querySelectorAll('.ec-line');
    if (lines.length > 0) return [...lines].map((l) => l.textContent ?? '').join('\n');
    return this.querySelector('pre')?.textContent ?? '';
  }

  #part(name: string): HTMLElement {
    return this.querySelector(`[data-part="${name}"]`)!;
  }
}

if (!customElements.get('hylo-playground')) customElements.define('hylo-playground', HyloPlayground);
