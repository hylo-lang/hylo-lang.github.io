/**
 * `<hylo-playground>`: makes the code block inside it runnable, and editable if it allows it.
 *
 * Rendered by `Playground.astro`, which documents the attributes and checks them as the site
 * builds, and sets the code as `data-source`. The code block inside is whatever Expressive Code
 * rendered for the author's fence, and stays on the page until the reader edits it, so a snippet
 * looks like every other code block and works without JavaScript.
 *
 * The element is set up when first connected, once: every listener it adds is on its own
 * children, which move with it, so none needs removing. Moving it elsewhere in the page (which
 * disconnects and connects it at once) keeps its editor and results; removing it resets it,
 * stopping its run and releasing its editor, as `reset` does.
 */
import type { Result } from './compiler';
import type { Editor } from './editor';
import { compiler } from './page-compiler';
import { ResultPane } from './pane';
import { renderView, showCompilerStatus, summarize } from './rendering';
import { DEFAULT_SETTINGS, parseOptimizationLevel, parsePhase } from './settings';
import { playgroundURL } from './share';
import { snippetRequest, type SnippetSettings } from './snippet';
import { connectTabs } from './tabs';
import { VIEWS, type View } from './views';

/** How long the reader's edits must pause before a snippet that has been run runs again. */
const RERUN_DELAY_MILLISECONDS = 400;

/**
 * Returns the settings `Playground.astro` set as `data-` attributes in `dataset`.
 *
 * Throws a `RangeError` if one is not a value it sets, which only a page not rendered by it has.
 */
function readSettings(dataset: DOMStringMap): SnippetSettings {
  const views = (dataset.views ?? 'result').split(',');
  const unknown = views.find((view) => !VIEWS.includes(view as View));
  if (unknown !== undefined) throw new RangeError(`'${unknown}' is not a view of a snippet`);
  return {
    views: views as View[],
    optimization:
      dataset.optimization === undefined
        ? DEFAULT_SETTINGS.optimization
        : parseOptimizationLevel(dataset.optimization),
    standardLibrary:
      dataset.standardLibrary === undefined
        ? DEFAULT_SETTINGS.standardLibrary
        : dataset.standardLibrary !== 'false',
    stopAfter: parsePhase(dataset.stopAfter ?? ''),
  };
}

/** The element; see the module's documentation. */
class HyloPlayground extends HTMLElement {
  /** The settings, read from the attributes once connected. */
  #settings!: SnippetSettings;
  /** The code as the author wrote it, which `Playground.astro` sets as `data-source`. */
  #originalSource = '';
  /** The editor, from the moment the reader asks to edit, while it loads and after. */
  #editorLoading: Promise<Editor> | null = null;
  /** The editor, once it is loaded. */
  #editor: Editor | null = null;
  /** Incremented whenever an editor that is loading should no longer be shown. */
  #editorGeneration = 0;
  /** What the code did the last time it ran, if it ran since it was last reset. */
  #lastResult: Result | null = null;
  /** What running the code produced, shown as it is produced. */
  #pane!: ResultPane;
  /** Marks a view's tab as the selected one, if the snippet has more than one view. */
  #markSelectedTab: ((view: View) => void) | null = null;
  /** Aborts the run under way, if any, whose results are wanted until it is aborted. */
  #currentRun: AbortController | null = null;
  /** Stops showing the compiler's loading, while a run waits for it. */
  #stopShowingLoading: (() => void) | null = null;
  /** The run the reader's last edits scheduled, if it has not started. */
  #scheduledRun: ReturnType<typeof setTimeout> | undefined;

  /** Whether the element has been set up, which happens when it is first connected. */
  #setUp = false;

  /** Sets the element up, unless it is set up already. */
  connectedCallback(): void {
    if (this.#setUp) return;
    this.#setUp = true;
    this.#setUpOnce();
  }

  /**
   * Resets the element once the current task's microtasks are done, if it has not been connected
   * again by then: a move disconnects and connects it within one task.
   */
  disconnectedCallback(): void {
    queueMicrotask(() => {
      if (!this.isConnected) this.reset();
    });
  }

  /** Reads the settings and the code, and makes the buttons work. */
  #setUpOnce(): void {
    this.#settings = readSettings(this.dataset);
    this.#originalSource = this.dataset.source ?? '';
    this.#part('run')!.addEventListener('click', () => void this.compileAndRun());
    this.#part('edit')?.addEventListener('click', () => void this.edit()?.catch(() => {}));
    this.#part('reset')?.addEventListener('click', () => this.reset());
    // The link is pointed at the code when it is about to be used, rather than on every edit:
    // a pointer enters it before clicking or tapping it, and the keyboard focuses it.
    const link = this.#part('open')!;
    link.addEventListener('pointerenter', () => this.#pointLinkAtCurrentCode());
    link.addEventListener('focus', () => this.#pointLinkAtCurrentCode());
    const tablist = this.querySelector<HTMLElement>('[role="tablist"]');
    const irFunctions = this.dataset.irFunctions ? this.dataset.irFunctions.split(',') : [];
    this.#pane = new ResultPane(
      {
        panel: this.#part('panel')!,
        tabs: tablist ? [...tablist.querySelectorAll<HTMLElement>('[role="tab"]')] : [],
        stageStrip: this.#part('stages')!,
        renderView: (container, view, result) =>
          renderView(container, view, result, {
            irFunctions,
            // Taking the reader to a diagnostic means editing the code.
            onReveal:
              this.#part('edit') !== null
                ? (line, column) =>
                    void this.edit()?.then((editor) => editor.reveal(line, column), () => {})
                : undefined,
          }),
      },
      this.#settings.views[0],
    );
    if (tablist) {
      this.#markSelectedTab = connectTabs(tablist, this.#part('panel')!, (view) => {
        void this.#selectView(view);
      });
      this.#markSelectedTab(this.#pane.selectedView);
    }
    this.toggleAttribute('data-ready', true);
  }

  /**
   * Compiles the code as it is now, runs it if it is a program, and shows the configured views of
   * what it did, each as soon as the stage producing it ends, starting the page's compiler if
   * needed.
   *
   * Called while a run is under way, aborts it: nothing it reports is shown. Never rejects.
   */
  async compileAndRun(): Promise<void> {
    this.#abortRun();
    const thisRun = new AbortController();
    this.#currentRun = thisRun;
    const statusLine = this.#part('status-line')!;
    this.#part('run')!.toggleAttribute('aria-busy', true);
    this.#part('results')!.hidden = false;
    // The compiler's loading, until there is a result to show instead.
    this.#stopShowingLoading = showCompilerStatus(compiler, this.#pane, statusLine);
    const result = await compiler.compileAndRun(snippetRequest(this.#source, this.#settings), {
      signal: thisRun.signal,
      onProgress: (progress) => void this.#pane.showProgress(progress),
    });
    // Aborted: by a newer run, a reset, or the snippet leaving the page.
    if (result === null) return;
    // Not a run the reader's latest edits scheduled meanwhile: that one is still to come.
    this.#endRun();
    this.#lastResult = result;
    statusLine.textContent = summarize(result);
    this.#editor?.showDiagnostics(result.compilation.diagnostics);
    await this.#pane.showAnswer(result);
  }

  /** Aborts the run under way and the one scheduled, if any. */
  #abortRun(): void {
    clearTimeout(this.#scheduledRun);
    this.#currentRun?.abort();
    this.#endRun();
  }

  /** Forgets the run under way, if any, and stops showing its progress. */
  #endRun(): void {
    this.#currentRun = null;
    this.#stopShowingLoading?.();
    this.#stopShowingLoading = null;
    this.#part('run')?.removeAttribute('aria-busy');
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
    this.#editorLoading ??= this.#createEditor();
    return this.#editorLoading;
  }

  /**
   * Puts the original code block back in place of the editor, and forgets what running the code
   * showed.
   */
  reset(): void {
    this.#abortRun();
    ++this.#editorGeneration;
    this.#editor?.dispose();
    this.#editor = null;
    this.#editorLoading = null;
    const host = this.#part('editor');
    if (host) {
      host.hidden = true;
      host.replaceChildren();
    }
    this.#part('source')!.hidden = false;
    this.#part('edit')?.removeAttribute('hidden');
    this.#part('reset')?.setAttribute('hidden', '');
    this.#part('results')!.hidden = true;
    this.#part('status-line')!.textContent = '';
    this.#lastResult = null;
    this.#pane.clear();
  }

  /** The code as the reader sees it now. */
  get #source(): string {
    return this.#editor?.value ?? this.#originalSource;
  }

  /**
   * Returns an editor created in place of the code block, once loaded; see `edit`.
   *
   * Rejects without showing anything if the snippet is reset or disconnected while it loads.
   */
  async #createEditor(): Promise<Editor> {
    const thisEditor = ++this.#editorGeneration;
    const host = this.#part('editor')!;
    try {
      const { createEditor } = await import('./editor');
      host.hidden = false;
      const editor = await createEditor(host, {
        value: this.#originalSource,
        fitContent: true,
        onChange: () => {
          // Once the reader has run the snippet, its results follow their edits.
          if (this.#lastResult !== null) {
            clearTimeout(this.#scheduledRun);
            this.#scheduledRun = setTimeout(
              () => void this.compileAndRun(),
              RERUN_DELAY_MILLISECONDS,
            );
          }
        },
        onRun: () => void this.compileAndRun(),
      });
      if (thisEditor !== this.#editorGeneration) {
        editor.dispose();
        throw new Error('the snippet was reset while its editor loaded');
      }
      this.#editor = editor;
      this.#part('source')!.hidden = true;
      this.#part('edit')!.hidden = true;
      this.#part('reset')!.hidden = false;
      if (this.#lastResult) editor.showDiagnostics(this.#lastResult.compilation.diagnostics);
      editor.focus();
      return editor;
    } catch (error) {
      if (thisEditor === this.#editorGeneration) {
        host.hidden = true;
        host.replaceChildren();
        this.#editorLoading = null;
        this.#showMessage(
          'The editor failed to load. Check your connection, and press Edit to try again.',
        );
      }
      throw error;
    }
  }

  /** Shows `sentence` in place of the views, forgetting what they showed, and announces it. */
  #showMessage(sentence: string): void {
    this.#part('results')!.hidden = false;
    this.#pane.showMessage(sentence);
    this.#part('status-line')!.textContent = sentence;
  }

  /** Selects `view`, and shows the latest results it has. */
  async #selectView(view: View): Promise<void> {
    this.#markSelectedTab?.(view);
    await this.#pane.selectView(view);
  }

  /**
   * Points the link to the full-screen playground at the code as it is now, with the snippet's
   * settings and the view selected. (Not the IR functions shown: the full-screen playground shows
   * all of the IR.)
   */
  #pointLinkAtCurrentCode(): void {
    const { optimization, standardLibrary, stopAfter } = this.#settings;
    const link = this.#part('open') as HTMLAnchorElement;
    link.href = playgroundURL({
      source: this.#source,
      optimization,
      standardLibrary,
      stopAfter,
      view: this.#pane.selectedView,
    });
  }

  /** Returns the element of this snippet whose `data-part` is `name`, if any. */
  #part(name: string): HTMLElement | null {
    return this.querySelector(`[data-part="${name}"]`);
  }
}

if (!customElements.get('hylo-playground')) customElements.define('hylo-playground', HyloPlayground);
