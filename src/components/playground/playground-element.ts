/**
 * `<hylo-playground>`: makes the code block inside it runnable, and editable if it allows it.
 *
 * Rendered by `Playground.astro`, which documents the attributes and checks them as the site
 * builds. The code block is whatever Expressive Code rendered for the author's fence, and stays on
 * the page until the reader edits it, so a snippet looks like every other code block and works
 * without JavaScript.
 */
import { compiler, type Result } from './compiler';
import type { Editor } from './editor';
import { describeStatus, renderOutput, renderStatus, summarize } from './outputs';
import { parseOptimizationLevel, PHASES } from './settings';
import { playgroundURL } from './share';
import { snippetRequest, type SnippetSettings } from './snippet';
import { connectTabs } from './tabs';
import { OUTPUTS, type Output } from './views';

/** How long the reader's edits must pause before a snippet that has been run runs again. */
const RERUN_DELAY_MILLISECONDS = 400;

/**
 * Returns the settings `Playground.astro` set as `data-` attributes in `dataset`.
 *
 * Throws a `RangeError` if one is not a value it sets, which only a page not rendered by it has.
 */
function readSettings(dataset: DOMStringMap): SnippetSettings {
  const outputs = (dataset.outputs ?? 'result').split(',');
  const unknown = outputs.find((o) => !OUTPUTS.includes(o as Output));
  if (unknown !== undefined) throw new RangeError(`'${unknown}' is not a view of a snippet`);
  const stopAfter = dataset.stopAfter ?? null;
  const phase = stopAfter === null ? null : PHASES.find((p) => p === stopAfter);
  if (phase === undefined) throw new RangeError(`'${stopAfter}' is not a phase of compilation`);
  return {
    outputs: outputs as Output[],
    optimization: parseOptimizationLevel(dataset.optimization ?? '0'),
    standardLibrary: dataset.standardLibrary !== 'false',
    stopAfter: phase,
  };
}

/** The element; see the module's documentation. */
class HyloPlayground extends HTMLElement {
  /** The settings, read from the attributes once connected. */
  #settings!: SnippetSettings;
  /** The code as the author wrote it. */
  #original = '';
  /** The editor, from the moment the reader asks to edit, while it loads and after. */
  #editor: Promise<Editor> | null = null;
  /** The editor, once it is loaded. */
  #loadedEditor: Editor | null = null;
  /** Incremented whenever an editor that is loading should no longer be shown. */
  #editorGeneration = 0;
  /** What the code did the last time it ran, if it ran since it was last reset. */
  #result: Result | null = null;
  /** The view shown, or to be shown once the code has run. */
  #shown: Output = 'result';
  /** Marks a view as the selected tab, if the snippet has more than one view. */
  #select: ((o: Output) => void) | null = null;
  /** Whether the code is being compiled and run. */
  #running = false;
  /** Whether to run again once the current run is done, the code having changed meanwhile. */
  #again = false;
  /** Incremented whenever what is shown is invalidated, so that a stale rendering is dropped. */
  #generation = 0;
  /** Stops showing the compiler's progress, while a run waits for it. */
  #unwatch: (() => void) | null = null;
  /** The run the reader's last edits scheduled, if it has not started. */
  #rerun: ReturnType<typeof setTimeout> | undefined;

  /** Reads the settings and the code, and makes the buttons work. */
  connectedCallback(): void {
    this.#settings = readSettings(this.dataset);
    this.#original = this.#readSource();
    this.#shown = this.#settings.outputs[0];
    this.#part('run')!.addEventListener('click', () => void this.run());
    this.#part('edit')?.addEventListener('click', () => void this.edit()?.catch(() => {}));
    this.#part('reset')?.addEventListener('click', () => this.reset());
    const tablist = this.querySelector<HTMLElement>('[role="tablist"]');
    if (tablist) {
      this.#select = connectTabs(tablist, this.#part('view')!, (o) => void this.#show(o));
      this.#select(this.#shown);
    }
    this.#updateLink();
    this.toggleAttribute('data-ready', true);
  }

  /** Stops what is pending, and releases the editor. */
  disconnectedCallback(): void {
    clearTimeout(this.#rerun);
    this.#unwatch?.();
    ++this.#editorGeneration;
    this.#loadedEditor?.dispose();
  }

  /**
   * Compiles the code as it is now, runs it if it is a program, and shows the configured views of
   * what it did, starting the page's compiler if needed.
   *
   * Called while a run is in progress, runs again once it is done, with the code as it is then.
   * Never rejects.
   */
  async run(): Promise<void> {
    clearTimeout(this.#rerun);
    if (this.#running) {
      this.#again = true;
      return;
    }
    this.#running = true;
    const generation = ++this.#generation;
    const button = this.#part('run')!;
    const view = this.#part('view')!;
    const status = this.#part('status')!;
    button.toggleAttribute('aria-busy', true);
    this.#part('output')!.hidden = false;

    let result: Result | null;
    try {
      // Progress, until the compiler has answered.
      this.#unwatch = compiler.watch((s) => {
        if (s.kind === 'ready') return;
        renderStatus(view, s);
        status.textContent = describeStatus(s) ?? '';
      });
      result = await compiler.compile(snippetRequest(this.#source, this.#settings));
    } finally {
      this.#unwatch?.();
      this.#unwatch = null;
      this.#running = false;
      button.removeAttribute('aria-busy');
    }
    if (this.#again) {
      this.#again = false;
      void this.run();
    }
    // Reset, or run again, while this ran.
    if (generation !== this.#generation || result === null) return;

    this.#result = result;
    status.textContent = summarize(result);
    this.#loadedEditor?.showDiagnostics(result.compile.diagnostics);
    await this.#show(this.#shown);
  }

  /**
   * Replaces the code block by an editor holding the same code, if the snippet is editable, and
   * returns it once it is loaded; returns `null` if the snippet is not editable.
   *
   * The returned promise rejects if the editor fails to load, which the snippet then says, showing
   * the code block again; asking again tries again.
   */
  edit(): Promise<Editor> | null {
    if (this.#part('edit') === null) return null;
    this.#editor ??= this.#createEditor();
    return this.#editor;
  }

  /**
   * Puts the original code block back in place of the editor, and forgets what running the code
   * showed.
   */
  reset(): void {
    ++this.#generation;
    ++this.#editorGeneration;
    clearTimeout(this.#rerun);
    this.#again = false;
    this.#loadedEditor?.dispose();
    this.#loadedEditor = null;
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
    this.#updateLink();
  }

  /** The code as the reader sees it now. */
  get #source(): string {
    return this.#loadedEditor?.value ?? this.#original;
  }

  /**
   * Returns an editor created in place of the code block, once loaded; see `edit`.
   *
   * Rejects without showing anything if the snippet is reset or disconnected while it loads.
   */
  async #createEditor(): Promise<Editor> {
    const mine = ++this.#editorGeneration;
    const host = this.#part('editor')!;
    try {
      const { createEditor } = await import('./editor');
      host.hidden = false;
      const editor = await createEditor(host, {
        value: this.#original,
        fitContent: true,
        onChange: () => {
          this.#updateLink();
          // Once the reader has run the snippet, its output follows their edits.
          if (this.#result !== null) {
            clearTimeout(this.#rerun);
            this.#rerun = setTimeout(() => void this.run(), RERUN_DELAY_MILLISECONDS);
          }
        },
        onRun: () => void this.run(),
      });
      if (mine !== this.#editorGeneration) {
        editor.dispose();
        throw new Error('the snippet was reset while its editor loaded');
      }
      this.#loadedEditor = editor;
      this.#part('source')!.hidden = true;
      this.#part('edit')!.hidden = true;
      this.#part('reset')!.hidden = false;
      if (this.#result) editor.showDiagnostics(this.#result.compile.diagnostics);
      editor.focus();
      return editor;
    } catch (e) {
      if (mine === this.#editorGeneration) {
        host.hidden = true;
        host.replaceChildren();
        this.#editor = null;
        this.#say('The editor failed to load. Check your connection, and press Edit to try again.');
      }
      throw e;
    }
  }

  /** Shows `sentence` in place of the views, and announces it. */
  #say(sentence: string): void {
    const p = document.createElement('p');
    p.className = 'pg-note';
    p.textContent = sentence;
    this.#part('output')!.hidden = false;
    this.#part('view')!.replaceChildren(p);
    this.#part('status')!.textContent = sentence;
  }

  /** Selects the `output` view, and shows it if the code has run. */
  async #show(output: Output): Promise<void> {
    if (output !== this.#shown) {
      this.#shown = output;
      this.#updateLink();
    }
    this.#select?.(output);
    if (!this.#result) return;
    const generation = this.#generation;
    const view = document.createElement('div');
    await renderOutput(view, output, this.#result, {
      focus: this.dataset.focus ? this.dataset.focus.split(',') : [],
      // Taking the reader to a diagnostic means editing the code.
      onReveal:
        this.#part('edit') !== null
          ? (line, column) => void this.edit()?.then((e) => e.reveal(line, column), () => {})
          : undefined,
    });
    // Another view may have been asked for, or the code run again, while this one rendered.
    if (generation !== this.#generation || output !== this.#shown) return;
    this.#part('view')!.replaceChildren(...view.childNodes);
  }

  /**
   * Points the link to the full-screen playground at the code as it is now, with the snippet's
   * settings and the view shown. (Not `focus`: the full-screen playground shows all of the IR.)
   */
  #updateLink(): void {
    const { optimization, standardLibrary, stopAfter } = this.#settings;
    const link = this.#part('open') as HTMLAnchorElement;
    link.href = playgroundURL({
      source: this.#source,
      optimization,
      standardLibrary,
      stopAfter,
      view: this.#shown,
    });
  }

  /** Returns the code of the block, as Expressive Code's copy button holds it. */
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

  /** Returns the element of this snippet whose `data-part` is `name`, if any. */
  #part(name: string): HTMLElement | null {
    return this.querySelector(`[data-part="${name}"]`);
  }
}

if (!customElements.get('hylo-playground')) customElements.define('hylo-playground', HyloPlayground);
