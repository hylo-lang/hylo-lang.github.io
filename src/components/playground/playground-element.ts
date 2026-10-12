/**
 * `<hylo-playground>`: makes the code blocks inside it runnable, and editable if it allows it.
 *
 * Rendered by `Playground.astro`, which documents the attributes and checks them as the site
 * builds, and sets the code as `data-` attributes: the files of the program as `data-files`, and
 * those shown, with the code of each compiled before and after what is shown, as `data-shown`
 * (see `SnippetCode`). The reader only sees and edits the code shown, in tabs if there are several
 * files, and the editors only mark the diagnostics in it; the full-screen playground opens on the
 * whole program as it is now. The code blocks inside are whatever Expressive Code rendered for the
 * author's fences, and stay on the page until the reader edits them, so a snippet looks like every
 * other code block and works without JavaScript.
 *
 * The element is set up when first connected, once: every listener it adds is on its own
 * children, which move with it, so none needs removing. Moving it elsewhere in the page (which
 * disconnects and connects it at once) keeps its editors and results; removing it resets it,
 * stopping its run and releasing its editors, as `reset` does.
 */
import type { Diagnostic, SourceFile } from '@hylo-lang/hylo-wasm/protocol';
import type { Result } from './compiler';
import type { Editor } from './editor';
import { connectFileTabs } from './file-tabs';
import { compiler } from './page-compiler';
import { ResultPane } from './pane';
import { renderView, showCompilerStatus, summarize } from './rendering';
import { DEFAULT_SETTINGS, parseOptimizationLevel, parsePhase } from './settings';
import { playgroundURL } from './share';
import {
  assembleProgram,
  lineCount,
  shownCodeOffset,
  snippetRequest,
  type ShownFile,
  type SnippetCode,
  type SnippetSettings,
} from './snippet';
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
  /** The code as the author wrote it, which `Playground.astro` sets as `data-` attributes. */
  #originalCode: SnippetCode = { files: [], shown: [] };
  /** The panel of each file shown, in order, holding its code block and its editor's host. */
  #filePanels: HTMLElement[] = [];
  /** Marks a file's tab as the selected one, if the snippet shows several files. */
  #markSelectedFile: ((index: number) => void) | null = null;
  /** The editors, one per file shown, from the moment the reader asks to edit, while they load. */
  #editorsLoading: Promise<Editor[]> | null = null;
  /** The editors, one per file shown, once they are loaded. */
  #editors: Editor[] | null = null;
  /** Incremented whenever editors that are loading should no longer be shown. */
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

  /** Reads the settings and the code, and makes the buttons and tabs work. */
  #setUpOnce(): void {
    this.#settings = readSettings(this.dataset);
    this.#originalCode = {
      files: JSON.parse(this.dataset.files ?? '[]') as SourceFile[],
      shown: JSON.parse(this.dataset.shown ?? '[]') as ShownFile[],
    };
    this.#filePanels = [...this.querySelectorAll<HTMLElement>('[data-file-panel]')];
    const fileTabs = this.#part('file-tabs');
    if (fileTabs) {
      this.#markSelectedFile = connectFileTabs(fileTabs, this.#filePanels, (i) =>
        this.#selectFile(i),
      );
    }
    this.#part('run')!.addEventListener('click', () => void this.compileAndRun());
    this.#part('edit')?.addEventListener('click', () => void this.edit()?.catch(() => {}));
    this.#part('reset')?.addEventListener('click', () => this.reset());
    // The link is pointed at the code when it is about to be used, rather than on every edit:
    // a pointer enters it before clicking or tapping it, and the keyboard focuses it.
    const link = this.#part('open')!;
    link.addEventListener('pointerenter', () => this.#pointLinkAtCurrentCode());
    link.addEventListener('focus', () => this.#pointLinkAtCurrentCode());
    const tablist = this.#part('view-tabs');
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
                ? (diagnostic) => void this.#reveal(diagnostic)
                : undefined,
            canReveal: (diagnostic) => this.#shownFileOf(diagnostic) !== null,
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
    const result = await compiler.compileAndRun(snippetRequest(this.#program, this.#settings), {
      signal: thisRun.signal,
      onProgress: (progress) => void this.#pane.showProgress(progress),
    });
    // Aborted: by a newer run, a reset, or the snippet leaving the page.
    if (result === null) return;
    // Not a run the reader's latest edits scheduled meanwhile: that one is still to come.
    this.#endRun();
    this.#lastResult = result;
    statusLine.textContent = summarize(result);
    this.#showDiagnosticsInEditors(result);
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
   * Replaces the code blocks by editors holding the same code, one per file shown, if the snippet
   * is editable, and returns them once they are loaded; returns `null` if the snippet is not
   * editable.
   *
   * The returned promise rejects if the editors fail to load, which the snippet then says, showing
   * the code blocks again; asking again tries again.
   */
  edit(): Promise<Editor[]> | null {
    if (this.#part('edit') === null) return null;
    this.#editorsLoading ??= this.#createEditors();
    return this.#editorsLoading;
  }

  /**
   * Puts the original code blocks back in place of the editors, and forgets what running the code
   * showed.
   */
  reset(): void {
    this.#abortRun();
    ++this.#editorGeneration;
    for (const editor of this.#editors ?? []) editor.dispose();
    this.#editors = null;
    this.#editorsLoading = null;
    this.#showCodeBlocks();
    this.#part('edit')?.removeAttribute('hidden');
    this.#part('reset')?.setAttribute('hidden', '');
    this.#part('results')!.hidden = true;
    this.#part('status-line')!.textContent = '';
    this.#lastResult = null;
    this.#pane.clear();
  }

  /** Empties and hides the editors' hosts, and shows the code blocks in their place. */
  #showCodeBlocks(): void {
    for (const panel of this.#filePanels) {
      const host = this.#partOf(panel, 'editor');
      if (host) {
        host.hidden = true;
        host.replaceChildren();
      }
      this.#partOf(panel, 'source')!.hidden = false;
    }
  }

  /** Shows the file shown at `index`, and marks its tab as selected. */
  #selectFile(index: number): void {
    for (const [i, panel] of this.#filePanels.entries()) {
      panel.toggleAttribute('data-selected', i === index);
    }
    // Its editor was laid out while not displayed, if it was created or kept in another tab.
    this.#editors?.[index].layout();
    this.#markSelectedFile?.(index);
  }

  /** The code shown, as the reader sees it now, file by file. */
  get #sources(): string[] {
    return (
      this.#editors?.map((editor) => editor.value) ??
      this.#originalCode.shown.map((f) => f.source)
    );
  }

  /** The files compiled: the code the reader sees now, with the code they do not. */
  get #program(): SourceFile[] {
    return assembleProgram(this.#originalCode, this.#sources);
  }

  /**
   * Returns the index of the file shown in whose code shown `diagnostic` is, or `null` if it is in
   * code the snippet does not show.
   */
  #shownFileOf(diagnostic: Diagnostic): number | null {
    // The compiler names a file `name` by the path of `hylo:///name`.
    const i = this.#originalCode.shown.findIndex((f) => diagnostic.file === `/${f.file}`);
    if (i < 0) return null;
    const line = diagnostic.site.line - shownCodeOffset(this.#originalCode.shown[i]);
    return line >= 1 && line <= lineCount(this.#sources[i]) ? i : null;
  }

  /** Returns `diagnostic`, in the code shown of the file at `index`, at its lines there. */
  #inShownCode(diagnostic: Diagnostic, index: number): Diagnostic {
    const offset = shownCodeOffset(this.#originalCode.shown[index]);
    return {
      ...diagnostic,
      site: {
        ...diagnostic.site,
        line: diagnostic.site.line - offset,
        endLine: diagnostic.site.endLine - offset,
      },
    };
  }

  /** Marks the diagnostics of `result` in the code shown in the editors, if there are any. */
  #showDiagnosticsInEditors(result: Result): void {
    for (const [i, editor] of (this.#editors ?? []).entries()) {
      editor.showDiagnostics(
        result.compilation.diagnostics
          .filter((diagnostic) => this.#shownFileOf(diagnostic) === i)
          .map((diagnostic) => this.#inShownCode(diagnostic, i)),
      );
    }
  }

  /** Takes the reader to `diagnostic` in the code shown, editing it, and showing its file. */
  async #reveal(diagnostic: Diagnostic): Promise<void> {
    const i = this.#shownFileOf(diagnostic);
    if (i === null) return;
    const editors = await this.edit()?.catch(() => null);
    if (!editors) return;
    this.#selectFile(i);
    const { line, column } = this.#inShownCode(diagnostic, i).site;
    editors[i].reveal(line, column);
  }

  /**
   * Returns editors created in place of the code blocks, once loaded; see `edit`.
   *
   * Rejects without showing anything if the snippet is reset or disconnected while they load.
   */
  async #createEditors(): Promise<Editor[]> {
    const thisGeneration = ++this.#editorGeneration;
    const created: Editor[] = [];
    try {
      const { createEditor } = await import('./editor');
      const onChange = () => {
        // Once the reader has run the snippet, its results follow their edits.
        if (this.#lastResult !== null) {
          clearTimeout(this.#scheduledRun);
          this.#scheduledRun = setTimeout(
            () => void this.compileAndRun(),
            RERUN_DELAY_MILLISECONDS,
          );
        }
      };
      for (const [i, shown] of this.#originalCode.shown.entries()) {
        const host = this.#partOf(this.#filePanels[i], 'editor')!;
        host.hidden = false;
        created.push(
          await createEditor(host, {
            value: shown.source,
            fitContent: true,
            firstLineNumber: shownCodeOffset(shown) + 1,
            onChange,
            onRun: () => void this.compileAndRun(),
          }),
        );
        if (thisGeneration !== this.#editorGeneration) {
          throw new Error('the snippet was reset while its editors loaded');
        }
      }
      this.#editors = created;
      for (const panel of this.#filePanels) this.#partOf(panel, 'source')!.hidden = true;
      this.#part('edit')!.hidden = true;
      this.#part('reset')!.hidden = false;
      if (this.#lastResult) this.#showDiagnosticsInEditors(this.#lastResult);
      const selected = this.#filePanels.findIndex((panel) => panel.hasAttribute('data-selected'));
      created[Math.max(0, selected)].focus();
      return created;
    } catch (error) {
      for (const editor of created) editor.dispose();
      if (thisGeneration === this.#editorGeneration) {
        this.#showCodeBlocks();
        this.#editorsLoading = null;
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
   * all of the IR.) The code is the whole program as the snippet compiles it, its files including
   * the code it does not show, and nothing of the snippets after it, showing the first file the
   * snippet shows.
   */
  #pointLinkAtCurrentCode(): void {
    const { optimization, standardLibrary, stopAfter } = this.#settings;
    const link = this.#part('open') as HTMLAnchorElement;
    const files = this.#program;
    const shown = this.#originalCode.shown[0].file;
    link.href = playgroundURL({
      files,
      active: shown === files[0].name ? undefined : shown,
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

  /** Returns the element of `panel`, a file's panel, whose `data-part` is `name`, if any. */
  #partOf(panel: HTMLElement, name: string): HTMLElement | null {
    return panel.querySelector(`[data-part="${name}"]`);
  }
}

if (!customElements.get('hylo-playground')) customElements.define('hylo-playground', HyloPlayground);
