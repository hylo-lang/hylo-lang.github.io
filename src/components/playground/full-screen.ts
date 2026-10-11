/**
 * The full-screen playground's script (`src/pages/playground.astro`, whose elements it expects by
 * their ids): an editor filling half the window, every view of the request in the other half,
 * compiled and run again as the reader types unless they turn auto-run off.
 *
 * Its state (see `PlaygroundState`) opens from a link (see `share.ts`), on load or when the link
 * is followed from the page itself, and is otherwise the one remembered from the reader's last
 * visit. A link, once opened, is removed from the address bar and its state remembered, so that a
 * reload shows what the reader has done since.
 */
import type { CompileRequest } from '@hylo-lang/hylo-wasm/protocol';
import type { Result } from './compiler';
import { createEditor, type Editor } from './editor';
import { EXAMPLES } from './examples';
import { compiler } from './page-compiler';
import { ResultPane } from './pane';
import { countErrors } from './diagnostics';
import {
  describeFailure,
  renderView,
  showCompilerStatus,
  summarize,
  viewSignature,
} from './rendering';
import {
  compileRequest,
  DEFAULT_TIME_LIMIT,
  parseOptimizationLevel,
  parsePhase,
  parseTimeLimit,
  type CompileSettings,
} from './settings';
import { DEFAULT_STATE, playgroundURL, serialize, type PlaygroundState } from './share';
import { decodeFragment, deserialize, type DecodedState } from './share-reader';
import { isSettled } from './stages';
import { connectTabs } from './tabs';
import { isArtifactView, VIEWS, type View } from './views';

/** Where the state of the last visit is kept, as `serialize` writes it. */
const STATE_STORAGE_KEY = 'hylo-playground:state';
/** Where the reader's choice of auto-run is kept: `"off"`, or anything else for on. */
const AUTORUN_STORAGE_KEY = 'hylo-playground:autorun';
/**
 * Where the reader's choice of time limit is kept, in seconds. A preference of the reader's, like
 * auto-run, rather than part of the state a link shares.
 */
const TIME_LIMIT_STORAGE_KEY = 'hylo-playground:time-limit';
/** How long typing must pause before the code is compiled and run. */
const AUTORUN_DELAY_MILLISECONDS = 400;
/** How long changes must pause before the state is remembered. */
const SAVE_DELAY_MILLISECONDS = 300;
/** What every request asks for, besides an executable: every artifact a view shows. */
const ARTIFACT_VIEWS = VIEWS.filter(isArtifactView);
/** The state of a first visit. */
const FIRST_VISIT_STATE: PlaygroundState = { source: EXAMPLES[0].source, ...DEFAULT_STATE };

/** Returns the element whose id is `id`, which the page has. */
const elementById = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
// The page's elements.
const panel = elementById<HTMLElement>('pg-panel');
const tablist = elementById<HTMLElement>('pg-tabs');
const optimizationSelect = elementById<HTMLSelectElement>('pg-optimization');
const stopAfterSelect = elementById<HTMLSelectElement>('pg-stop-after');
const standardLibraryCheckbox = elementById<HTMLInputElement>('pg-standard-library');
const timeLimitSelect = elementById<HTMLSelectElement>('pg-time-limit');
const moreMenuButton = elementById<HTMLButtonElement>('pg-more-button');
const moreMenu = elementById<HTMLElement>('pg-more');
const examplesSelect = elementById<HTMLSelectElement>('pg-examples');
const autorunCheckbox = elementById<HTMLInputElement>('pg-autorun');
const runButton = elementById<HTMLButtonElement>('pg-run');
const shareButton = elementById<HTMLButtonElement>('pg-share');
const shareLabel = elementById<HTMLElement>('pg-share-label');
const statusLine = elementById<HTMLElement>('pg-status-line');
const hintLine = elementById<HTMLElement>('pg-hint-line');
const errorCountBadge = elementById<HTMLElement>('pg-error-count');

/** The shortcut running the code on this platform, as keys and as text. */
const RUN_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform)
  ? { keys: '⌘ ↵', text: '⌘+Enter' }
  : { keys: 'Ctrl ↵', text: 'Ctrl+Enter' };
for (const hint of document.querySelectorAll<HTMLElement>('[data-shortcut]')) {
  hint.textContent = RUN_SHORTCUT.keys;
}
runButton.title = `Compile and run (${RUN_SHORTCUT.text})`;

/**
 * Returns the value stored under `key` in local storage, or `null` if none is, or it is
 * unavailable.
 */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value` under `key` in local storage, if it is available. */
function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering is fine.
  }
}

/**
 * Returns the state in `location.hash`, or why it holds none, or `null` if it does not try to
 * hold one; removes it from the address bar and stores its state, so that a reload shows what the
 * reader does from then on.
 */
function takeLinkedState(): DecodedState | null {
  const linked = decodeFragment(location.hash);
  if (linked === null) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if ('state' in linked) store(STATE_STORAGE_KEY, serialize(linked.state));
  return linked;
}

/** Returns the state stored at the last visit, or that of a first visit. */
function storedState(): PlaygroundState {
  const stored = readStored(STATE_STORAGE_KEY);
  const decoded = stored === null ? null : deserialize(stored);
  return decoded !== null && 'state' in decoded ? decoded.state : FIRST_VISIT_STATE;
}

/** The link the page was opened with, if any. */
const openingLink = takeLinkedState();
/** The state the page opens with. */
const openingState =
  openingLink !== null && 'state' in openingLink ? openingLink.state : storedState();
/** Why the last link followed could not be read, until the reader edits the code. */
let linkProblem =
  openingLink !== null && 'problem' in openingLink ? openingLink.problem : undefined;
/** Aborts the page's latest request, the only one whose results are still wanted. */
let latestRequest: AbortController | null = null;
/** The diagnostics the editor and the error count show, as their `viewSignature`. */
let diagnosticsShownInEditor = '';

/** What the page's requests produced. */
const pane = new ResultPane(
  {
    panel,
    tabs: [...tablist.querySelectorAll<HTMLElement>('[role="tab"]')],
    stageStrip: elementById('pg-stages'),
    renderView: (container, view, result) =>
      renderView(container, view, result, {
        onReveal: (line, column) => editor.reveal(line, column),
      }),
  },
  openingState.view,
);

autorunCheckbox.checked = readStored(AUTORUN_STORAGE_KEY) !== 'off';
// Before the settings, which mark the menu if it differs from its default.
timeLimitSelect.value = String(parseTimeLimit(readStored(TIME_LIMIT_STORAGE_KEY)));
applySettings(openingState);
// The compiler, the longest download, loads while the editor does.
compiler.startLoading();

/** The editor, holding the code. */
const editor: Editor = await createEditor(elementById('pg-editor'), {
  value: openingState.source,
  onChange: () => {
    linkProblem = undefined;
    scheduleSave();
    if (autorunCheckbox.checked) {
      scheduleCompileAndRun();
    } else {
      markStale();
    }
  },
  onRun: () => void compileAndRun(),
});

/** Sets the controls to `settings`. */
function applySettings(settings: CompileSettings): void {
  optimizationSelect.value = String(settings.optimization);
  stopAfterSelect.value = settings.stopAfter ?? '';
  standardLibraryCheckbox.checked = settings.standardLibrary;
  markMoreMenuIfModified();
}

/** Marks the "More options" button iff a setting in its menu differs from its default. */
function markMoreMenuIfModified(): void {
  moreMenuButton.toggleAttribute(
    'data-modified',
    stopAfterSelect.value !== '' ||
      !standardLibraryCheckbox.checked ||
      parseTimeLimit(timeLimitSelect.value) !== DEFAULT_TIME_LIMIT,
  );
}

/** Places the "More options" menu under its button, within the window. */
function positionMoreMenu(): void {
  const button = moreMenuButton.getBoundingClientRect();
  const margin = 8;
  const widest = innerWidth - moreMenu.offsetWidth - margin;
  moreMenu.style.top = `${button.bottom + 6}px`;
  moreMenu.style.left = `${Math.max(margin, Math.min(button.left, widest))}px`;
}

/** Returns the settings the controls are set to. */
function currentSettings(): CompileSettings {
  return {
    optimization: parseOptimizationLevel(optimizationSelect.value),
    standardLibrary: standardLibraryCheckbox.checked,
    stopAfter: parsePhase(stopAfterSelect.value),
  };
}

/** Returns the state of the page now. */
function currentState(): PlaygroundState {
  return { source: editor.value, ...currentSettings(), view: pane.selectedView };
}

/** The save the last changes scheduled, if it has not happened. */
let scheduledSave: ReturnType<typeof setTimeout> | undefined;
/** Stores the state for the next visit once changes pause, or when the page is left. */
function scheduleSave(): void {
  clearTimeout(scheduledSave);
  scheduledSave = setTimeout(saveNow, SAVE_DELAY_MILLISECONDS);
}

/** Stores the state for the next visit now. */
function saveNow(): void {
  clearTimeout(scheduledSave);
  scheduledSave = undefined;
  store(STATE_STORAGE_KEY, serialize(currentState()));
}

/** The request the last edits scheduled, if it has not been made. */
let scheduledRequest: ReturnType<typeof setTimeout> | undefined;
/** Compiles and runs the code once typing pauses, unless this is called again before. */
function scheduleCompileAndRun(): void {
  clearTimeout(scheduledRequest);
  scheduledRequest = setTimeout(() => {
    scheduledRequest = undefined;
    void compileAndRun();
  }, AUTORUN_DELAY_MILLISECONDS);
}

/** Returns the request compiling the page's code with its settings now. */
function currentRequest(): CompileRequest {
  const { source, ...settings } = currentState();
  return compileRequest(source, ARTIFACT_VIEWS, settings);
}

/**
 * Compiles the code with the settings as they are now, runs it if it is a program, and shows
 * what it did, each view as soon as the stage producing it ends. The previous request is aborted,
 * so that typing never queues up stale work, and nothing it reports afterwards is shown; the Run
 * button is busy until the latest request is answered. Never rejects.
 */
async function compileAndRun(): Promise<void> {
  clearTimeout(scheduledRequest);
  scheduledRequest = undefined;
  const request = currentRequest();
  latestRequest?.abort();
  const thisRequest = new AbortController();
  latestRequest = thisRequest;
  runButton.toggleAttribute('aria-busy', true);
  const result = await compiler.compileAndRun(request, {
    signal: thisRequest.signal,
    timeLimit: parseTimeLimit(timeLimitSelect.value),
    onProgress: (progress) => {
      void pane.showProgress(progress);
      showDiagnosticsOf(progress);
    },
  });
  // Superseded: the newer request shows what it does.
  if (result === null) return;
  latestRequest = null;
  runButton.removeAttribute('aria-busy');
  void pane.showAnswer(result);
  // The code or the settings may have changed while this was compiled.
  document.body.toggleAttribute(
    'data-stale',
    JSON.stringify(request) !== JSON.stringify(currentRequest()),
  );
  showDiagnosticsOf(result);
  const timing =
    describeFailure(result) === undefined
      ? ` Compiled in ${result.compilation.milliseconds.toFixed(0)} ms.`
      : '';
  statusLine.textContent = summarize(result) + timing;
  updateHint();
}

/**
 * Shows the diagnostics of `result`, the newest request's progress or answer, in the editor and
 * as the error count, once the front end is done.
 */
function showDiagnosticsOf(result: Result): void {
  if (!isSettled(result.stages['front-end'])) return;
  const signature = viewSignature('diagnostics', result);
  if (signature === diagnosticsShownInEditor) return;
  diagnosticsShownInEditor = signature;
  const { diagnostics } = result.compilation;
  editor.showDiagnostics(diagnostics);
  const errors = countErrors(diagnostics);
  errorCountBadge.textContent = errors > 0 ? String(errors) : '';
}

/** Marks what is shown as behind the code, if anything is shown. */
function markStale(): void {
  if (!pane.isShowingResult) return;
  document.body.toggleAttribute('data-stale', true);
  updateHint();
}

/** Says what the reader should know: a link that did not open, or how to run the code. */
function updateHint(): void {
  const stale = document.body.hasAttribute('data-stale');
  hintLine.textContent =
    linkProblem ??
    (autorunCheckbox.checked
      ? ''
      : stale
        ? `Edited since it last ran: press Run or ${RUN_SHORTCUT.text}.`
        : `Auto-run is off: press Run or ${RUN_SHORTCUT.text} to run.`);
}

/** Marks a view's tab as the selected one. */
const markSelectedTab = connectTabs(tablist, panel, (view) => void selectView(view));

/** Selects `view`, and shows the latest results it has. */
async function selectView(view: View): Promise<void> {
  if (view !== pane.selectedView) scheduleSave();
  markSelectedTab(view);
  await pane.selectView(view);
}
markSelectedTab(pane.selectedView);

/**
 * Opens the state in `location.hash`, if it holds one, when a link to the page is followed from
 * the page itself: the code replaces the editor's as an edit the reader can undo.
 */
function openFollowedLink(): void {
  const linked = takeLinkedState();
  if (linked === null) return;
  if ('problem' in linked) {
    linkProblem = linked.problem;
    updateHint();
    return;
  }
  linkProblem = undefined;
  applySettings(linked.state);
  editor.replace(linked.state.source);
  void selectView(linked.state.view);
  void compileAndRun();
}

// Loading is shown until there is a result to show instead.
showCompilerStatus(compiler, pane, statusLine);

for (const example of EXAMPLES) examplesSelect.add(new Option(example.name, example.name));
examplesSelect.addEventListener('change', () => {
  const example = EXAMPLES.find((candidate) => candidate.name === examplesSelect.value);
  examplesSelect.value = '';
  if (!example) return;
  // Through the editor, so that the change is one the reader can undo.
  editor.replace(example.source);
  editor.focus();
});
for (const control of [optimizationSelect, stopAfterSelect, standardLibraryCheckbox]) {
  control.addEventListener('change', () => {
    markMoreMenuIfModified();
    scheduleSave();
    void compileAndRun();
  });
}
moreMenu.addEventListener('toggle', (event) => {
  if ((event as ToggleEvent).newState === 'open') positionMoreMenu();
});
addEventListener('resize', () => {
  if (moreMenu.matches(':popover-open')) positionMoreMenu();
});
timeLimitSelect.addEventListener('change', () => {
  store(TIME_LIMIT_STORAGE_KEY, timeLimitSelect.value);
  markMoreMenuIfModified();
});
autorunCheckbox.addEventListener('change', () => {
  store(AUTORUN_STORAGE_KEY, autorunCheckbox.checked ? 'on' : 'off');
  if (autorunCheckbox.checked) {
    if (document.body.hasAttribute('data-stale')) void compileAndRun();
  } else if (scheduledRequest !== undefined) {
    // A request the last edits scheduled is not one the reader still wants.
    clearTimeout(scheduledRequest);
    scheduledRequest = undefined;
    markStale();
  }
  updateHint();
});
runButton.addEventListener('click', () => void compileAndRun());
addEventListener('hashchange', openFollowedLink);
// Edits made just before leaving are remembered too.
addEventListener('pagehide', () => {
  if (scheduledSave !== undefined) saveNow();
});

/** Puts the Share button back as it was, once it has said the link was copied. */
let scheduledShareReset: ReturnType<typeof setTimeout> | undefined;
shareButton.addEventListener('click', async () => {
  const url = new URL(playgroundURL(currentState()), location.href).href;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // No clipboard here (an insecure origin, or permission refused): the reader copies it.
    prompt('Copy this link to share the code:', url);
    return;
  }
  shareLabel.textContent = 'Link copied';
  shareButton.toggleAttribute('data-done', true);
  clearTimeout(scheduledShareReset);
  scheduledShareReset = setTimeout(() => {
    shareLabel.textContent = 'Share';
    shareButton.removeAttribute('data-done');
  }, 2000);
});

updateHint();
// The page opens on what the code does, whether or not it runs as the reader types.
void compileAndRun();
