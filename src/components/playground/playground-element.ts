/**
 * `<hylo-playground>`: makes the code block inside it runnable, and editable if it allows it.
 *
 * Rendered by `Playground.astro`, which documents the attributes. The code block is whatever
 * Expressive Code rendered for the author's fence, and stays on the page until the reader edits
 * it, so a snippet looks like every other code block and works without JavaScript.
 */
import { compiler } from './compiler';
import { describeStatus, renderOutput, renderStatus, summarize } from './outputs';
import type { Phase } from '@hylo-lang/hylo-wasm/protocol';
import type { Result } from './compiler';
import { snippetRequest, type SnippetSettings } from './snippet';
import { isOptimizationLevel, playgroundURL } from './share';
import { connectTabs } from './tabs';
import type { Output } from './views';
import type { Editor } from './editor';

class HyloPlayground extends HTMLElement {
  #original = '';
  #editor: Promise<Editor> | null = null;
  #result: Result | null = null;
  #shown: Output = 'result';
  #select: ((o: Output) => void) | null = null;
  #running = false;
  /** Whether to run again once the current run is done, the code having changed meanwhile. */
  #again = false;
  /** Incremented whenever what is shown is invalidated, so that a stale rendering is dropped. */
  #generation = 0;
  #unwatch: (() => void) | null = null;
  #rerun: ReturnType<typeof setTimeout> | undefined;

  get #settings(): SnippetSettings {
    return {
      outputs: (this.dataset.outputs ?? 'result').split(',') as Output[],
      optimization: Number(this.dataset.optimization ?? 0),
      standardLibrary: this.dataset.standardLibrary !== 'false',
      stopAfter: (this.dataset.stopAfter || undefined) as Phase | undefined,
    };
  }

  get #editable(): boolean {
    return this.#part('edit') !== null;
  }

  connectedCallback(): void {
    this.#original = this.#readSource();
    this.#shown = this.#settings.outputs[0];
    this.#part('run')!.addEventListener('click', () => void this.run());
    this.#part('edit')?.addEventListener('click', () => void this.edit());
    this.#part('reset')?.addEventListener('click', () => this.reset());
    const tablist = this.querySelector<HTMLElement>('[role="tablist"]');
    if (tablist) {
      this.#select = connectTabs(tablist, this.#part('view')!, (o) => void this.#show(o));
      this.#select(this.#shown);
    }
    void this.#updateLink(this.#original);
    this.toggleAttribute('data-ready', true);
  }

  disconnectedCallback(): void {
    clearTimeout(this.#rerun);
    this.#unwatch?.();
    void this.#editor?.then((e) => e.dispose());
  }

  /** Compiles and runs the code, showing the configured outputs. */
  async run(): Promise<void> {
    clearTimeout(this.#rerun);
    if (this.#running) {
      // Edited while running: run the newer code once this run is done.
      this.#again = true;
      return;
    }
    this.#running = true;
    const generation = ++this.#generation;
    const button = this.#part('run')!;
    button.toggleAttribute('aria-busy', true);
    const view = this.#part('view')!;
    const status = this.#part('status')!;
    this.#part('output')!.hidden = false;

    // Progress, until the compiler has answered.
    this.#unwatch = compiler.watch((s) => {
      if (s.kind === 'ready') return;
      renderStatus(view, s);
      status.textContent = describeStatus(s) ?? '';
    });
    const source = await this.#source();
    const result = await compiler.compile(snippetRequest(source, this.#settings));
    this.#unwatch();
    this.#unwatch = null;
    this.#running = false;
    button.removeAttribute('aria-busy');
    if (this.#again) {
      this.#again = false;
      void this.run();
    }
    if (generation !== this.#generation || result === null) return;

    this.#result = result;
    status.textContent = summarize(result);
    (await this.#editor)?.showDiagnostics(result.compile.diagnostics);
    await this.#show(this.#shown);
  }

  /** Replaces the code block by an editor holding the same code, if the snippet is editable. */
  edit(): Promise<Editor> | null {
    if (!this.#editable) return null;
    this.#editor ??= (async () => {
      const { createEditor } = await import('./editor');
      const host = this.#part('editor')!;
      host.hidden = false;
      const editor = await createEditor(host, {
        value: this.#original,
        fitContent: true,
        onChange: (value) => {
          void this.#updateLink(value);
          // Once the reader has run the snippet, its output follows their edits.
          if (this.#result !== null) {
            clearTimeout(this.#rerun);
            this.#rerun = setTimeout(() => void this.run(), 400);
          }
        },
        onRun: () => void this.run(),
      });
      this.#part('source')!.hidden = true;
      this.#part('edit')!.hidden = true;
      this.#part('reset')!.hidden = false;
      if (this.#result) editor.showDiagnostics(this.#result.compile.diagnostics);
      return editor;
    })();
    void this.#editor.then((e) => e.focus());
    return this.#editor;
  }

  /** Puts the original code block back, and forgets what running it showed. */
  reset(): void {
    ++this.#generation;
    clearTimeout(this.#rerun);
    this.#again = false;
    void this.#editor?.then((e) => e.dispose());
    this.#editor = null;
    const host = this.#part('editor');
    if (host) {
      host.hidden = true;
      host.replaceChildren();
    }
    this.#part('source')!.hidden = false;
    this.#part('edit')?.removeAttribute('hidden');
    this.#part('reset')?.setAttribute('hidden', '');
    this.#part('output')!.hidden = true;
    this.#part('status')!.textContent = '';
    this.#result = null;
    void this.#updateLink(this.#original);
  }

  /** The code as the reader sees it now. */
  async #source(): Promise<string> {
    return (await this.#editor)?.value ?? this.#original;
  }

  async #show(output: Output): Promise<void> {
    if (output !== this.#shown) {
      this.#shown = output;
      void this.#source().then((s) => this.#updateLink(s));
    }
    this.#select?.(output);
    if (!this.#result) return;
    const generation = this.#generation;
    const view = document.createElement('div');
    await renderOutput(view, output, this.#result, {
      focus: this.dataset.focus ? this.dataset.focus.split(',') : [],
      // Taking the reader to a diagnostic means editing the code.
      onReveal: this.#editable
        ? (line, column) => void this.edit()?.then((e) => e.reveal(line, column))
        : undefined,
    });
    // Another view may have been asked for, or the code run again, while this one rendered.
    if (generation !== this.#generation || output !== this.#shown) return;
    this.#part('view')!.replaceChildren(...view.childNodes);
  }

  /** Points the link to the full-screen playground at `source`. */
  async #updateLink(source: string): Promise<void> {
    const link = this.#part('open') as HTMLAnchorElement;
    const level = this.#settings.optimization;
    const url = await playgroundURL({
      source,
      optimization: isOptimizationLevel(level) ? level : 0,
      view: this.#shown,
    });
    // Encoding is asynchronous; a later edit may have been encoded first.
    if (source === (await this.#source())) link.href = url;
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

  #part(name: string): HTMLElement | null {
    return this.querySelector(`[data-part="${name}"]`);
  }
}

if (!customElements.get('hylo-playground')) customElements.define('hylo-playground', HyloPlayground);
