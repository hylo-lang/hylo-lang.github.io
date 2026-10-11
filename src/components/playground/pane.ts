/**
 * What a playground's requests produced: the panel showing the selected view, the tabs choosing
 * it, and the strip of stages (`Stages.astro`), kept in step with the playground's newest request
 * as it progresses, so that each view shows its results as soon as the stage producing them ends.
 *
 * Until then, the panel keeps showing what the last answer had, marked busy (`aria-busy`, which
 * `playground.css` shows with a progress cursor), with a tooltip saying what it is waiting for, and
 * the view's tab is marked `data-pending`, which `playground.css` de-emphasizes once a moment has
 * passed: quick requests replace what is shown in place, without anything moving or flashing.
 * With no result to show yet, the panel shows the compiler loading, or why it failed to, or what
 * the view waits for.
 *
 * The pane is the only writer of the panel's contents.
 */
import type { CompilerStatus, Result } from './compiler';
import { mutedParagraph, renderCompilerStatus, viewSignature } from './rendering';
import {
  describeStageState,
  describeWait,
  isSettled,
  STAGE_TITLES,
  stageProducing,
  STAGES,
} from './stages';
import type { View } from './views';

/** Renders the `view` of `result` into `container`, as `renderView` does. */
type RenderView = (container: HTMLElement, view: View, result: Result) => Promise<void>;

/** The elements of a pane, and how it renders a view. */
export interface PaneElements {
  /** The element showing the selected view. */
  panel: HTMLElement;
  /** The tabs, `[role="tab"][data-view]` buttons, if the playground offers several views. */
  tabs: readonly HTMLElement[];
  /** The strip of stages that `Stages.astro` renders. */
  stageStrip: HTMLElement;
  renderView: RenderView;
}

/** A pane; see the module's documentation. */
export class ResultPane {
  #elements: PaneElements;
  #selectedView: View;
  /** The newest request's progress, or its answer once it has one; `null` until a request. */
  #newest: Result | null = null;
  /** The last answer, shown where the newest request has yet to settle a view; `null` until one. */
  #lastAnswer: Result | null = null;
  /** The compiler's status, as last told. */
  #compilerStatus: CompilerStatus = { kind: 'idle' };
  /** What the panel shows, if it shows a view of a result: the view, and its `viewSignature`. */
  #rendered: { view: View; signature: string } | null = null;
  /** Incremented whenever a rendering starts, so that a stale one is dropped. */
  #renderGeneration = 0;

  /** Creates a pane of `elements` showing nothing, with `selectedView` selected. */
  constructor(elements: PaneElements, selectedView: View) {
    this.#elements = elements;
    this.#selectedView = selectedView;
  }

  /** The view selected. */
  get selectedView(): View {
    return this.#selectedView;
  }

  /**
   * Whether the panel shows a view of a result, rather than nothing or what its owner put there.
   */
  get isShowingResult(): boolean {
    return this.#rendered !== null;
  }

  /**
   * Selects `view`, and shows the latest results it has; resolves once they are shown, or
   * replaced by others.
   */
  selectView(view: View): Promise<void> {
    this.#selectedView = view;
    return this.#refresh();
  }

  /**
   * Shows `progress`, that of the playground's newest request, as `Compiler.compileAndRun`
   * reports it, in the views it settles; resolves once they are shown, or replaced by others.
   */
  showProgress(progress: Result): Promise<void> {
    this.#newest = progress;
    return this.#refresh();
  }

  /**
   * Shows `answer`, the answer to the playground's newest request; resolves once it is shown, or
   * replaced by another. (The caller aborts an older request rather than show its answer.)
   */
  showAnswer(answer: Result): Promise<void> {
    this.#lastAnswer = this.#newest = answer;
    return this.#refresh();
  }

  /**
   * Records `status`, the compiler's, which the panel shows while it has no result to show: see
   * `showCompilerStatus` in `rendering.ts`.
   */
  showCompilerStatus(status: CompilerStatus): void {
    this.#compilerStatus = status;
    if (!this.isShowingResult) void this.#refresh();
  }

  /**
   * Shows `message` in the panel in place of any result, until the next request shows one.
   */
  showMessage(message: string): void {
    this.clear();
    this.#elements.panel.replaceChildren(mutedParagraph(message));
  }

  /** Forgets every request, and shows nothing. */
  clear(): void {
    ++this.#renderGeneration;
    this.#newest = this.#lastAnswer = this.#rendered = null;
    this.#elements.panel.replaceChildren();
    void this.#refresh();
  }

  /**
   * Returns the result whose `view` to show, and what that view waits for: the newest request's
   * result and nothing if the stage producing the view has ended; otherwise the last answer, or
   * `null` if there is none, and a phrase saying what the newest request is doing.
   */
  #viewState(view: View): { result: Result | null; wait: string | null } {
    const newest = this.#newest;
    if (newest === null) return { result: this.#lastAnswer, wait: null };
    const stage = stageProducing(view, newest.stages);
    if (isSettled(newest.stages[stage])) return { result: newest, wait: null };
    return { result: this.#lastAnswer, wait: describeWait(stage, newest.stages) };
  }

  /** Brings the strip, the tabs and the panel in step with what has been recorded. */
  async #refresh(): Promise<void> {
    const { panel, tabs, stageStrip, renderView } = this.#elements;
    this.#refreshStageStrip(stageStrip);
    for (const tab of tabs) {
      const { wait } = this.#viewState(tab.dataset.view as View);
      tab.toggleAttribute('data-pending', wait !== null);
      if (wait !== null) tab.title = wait;
      else tab.removeAttribute('title');
    }

    const view = this.#selectedView;
    const { result, wait } = this.#viewState(view);
    if (wait !== null) {
      panel.setAttribute('aria-busy', 'true');
      panel.title = result !== null ? `Previous result. ${wait}.` : `${wait}.`;
    } else {
      panel.removeAttribute('aria-busy');
      panel.removeAttribute('title');
    }

    const rendered = this.#rendered;
    if (result === null) {
      // Nothing to show yet; not another view's results.
      ++this.#renderGeneration;
      this.#rendered = null;
      const status = this.#compilerStatus;
      if (status.kind === 'loading' || status.kind === 'failed') {
        renderCompilerStatus(panel, status);
      } else if (wait !== null) {
        panel.replaceChildren(mutedParagraph(`${wait}…`));
      }
      return;
    }
    const signature = viewSignature(view, result);
    if (rendered?.view === view && rendered.signature === signature) return;
    const generation = ++this.#renderGeneration;
    const contents = document.createElement('div');
    await renderView(contents, view, result);
    if (generation !== this.#renderGeneration) return;
    panel.replaceChildren(...contents.childNodes);
    this.#rendered = { view, signature };
  }

  /**
   * Shows in `strip` what the newest request is at: the stage under way, or the one waiting to
   * start; every stage it includes if one failed; nothing once it ended otherwise, which its
   * summary says.
   */
  #refreshStageStrip(strip: HTMLElement): void {
    const newest = this.#newest;
    const anyFailed = newest !== null && STAGES.some((stage) => newest.stages[stage] === 'failed');
    const current =
      newest === null
        ? undefined
        : (STAGES.find((stage) => newest.stages[stage] === 'running') ??
          STAGES.find((stage) => newest.stages[stage] === 'waiting'));
    strip.hidden = !anyFailed && current === undefined;
    if (newest === null) return;
    for (const stage of STAGES) {
      const item = strip.querySelector<HTMLElement>(`[data-stage="${stage}"]`)!;
      const state = newest.stages[stage];
      item.hidden = anyFailed ? state === 'off' : stage !== current;
      if (item.dataset.state === state) continue;
      item.dataset.state = state;
      item.title = `${STAGE_TITLES[stage]}: ${describeStageState(state)}`;
      item.querySelector('.pg-state')!.textContent = `: ${describeStageState(state)}`;
    }
  }
}
