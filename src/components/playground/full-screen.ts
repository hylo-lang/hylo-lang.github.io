/**
 * The full-screen playground's script (`src/pages/playground.astro`, whose elements it expects by
 * their ids): the program's files and every view of the request, in a dock (`playground-dock.ts`)
 * whose panels the reader can arrange, the files in one half of the window and the views in the
 * other to begin with, compiled and run again as the reader types unless they turn auto-run off.
 * While the program has one file, its half looks as an editor alone.
 *
 * Its state (see `PlaygroundState`) opens from a link (see `share.ts`), on load or when the link
 * is followed from the page itself, and is otherwise the one remembered from the reader's last
 * visit. A link, once opened, is removed from the address bar and its state remembered, so that a
 * reload shows what the reader has done since.
 */
import type { CompileRequest } from '@hylo-lang/hylo-wasm/protocol';
import type { CompilerStatus, Result } from './compiler';
import { EXAMPLES } from './examples';
import { PlaygroundDock } from './playground-dock';
import { compiler } from './page-compiler';
import { ResultPane } from './pane';
import { countErrors } from './diagnostics';
import {
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
import {
  DEFAULT_FILE_NAME,
  DEFAULT_STATE,
  playgroundURL,
  serialize,
  type PlaygroundState,
} from './share';
import { decodeFragment, deserialize, type DecodedState } from './share-reader';
import { isSettled } from './stages';
import { canProduce, isArtifactView, VIEWS, type View } from './views';

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
const FIRST_VISIT_STATE: PlaygroundState = {
  files: [{ name: DEFAULT_FILE_NAME, contents: EXAMPLES[0].source }],
  ...DEFAULT_STATE,
};

/** A checkbox or a menu of the page's. */
type Control = HTMLInputElement | HTMLSelectElement;

/** Returns the element whose id is `id`, which the page has. */
const elementById = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
// The page's elements.
const optimizationSelect = elementById<HTMLSelectElement>('pg-optimization');
const stopAfterSelect = elementById<HTMLSelectElement>('pg-stop-after');
const standardLibraryCheckbox = elementById<HTMLInputElement>('pg-standard-library');
const timeLimitInput = elementById<HTMLInputElement>('pg-time-limit');
const moreMenuButton = elementById<HTMLButtonElement>('pg-more-button');
const moreMenu = elementById<HTMLElement>('pg-more');
const examplesSelect = elementById<HTMLSelectElement>('pg-examples');
const autorunCheckbox = elementById<HTMLInputElement>('pg-autorun');
const runButton = elementById<HTMLButtonElement>('pg-run');
const shareButton = elementById<HTMLButtonElement>('pg-share');
const shareLabel = elementById<HTMLElement>('pg-share-label');
const statusLine = elementById<HTMLElement>('pg-status-line');
const hintLine = elementById<HTMLElement>('pg-hint-line');
const newFileButton = elementById<HTMLButtonElement>('pg-new-file');
/**
 * The header's controls and their copies in the "More options" menu, which the page shows instead
 * when the window is too narrow for them. The page reads and listens to the header's: a change to
 * a copy is made to its control, and a control's value is given to its copy.
 */
const copiedControls: [Control, Control][] = [
  [optimizationSelect, elementById('pg-optimization-copy')],
  [autorunCheckbox, elementById('pg-autorun-copy')],
];
/** The examples' menus: the header's, and its copy. */
const examplesSelects = [examplesSelect, elementById<HTMLSelectElement>('pg-examples-copy')];

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
/** The diagnostics the editors and the error count show, as their `viewSignature`. */
let diagnosticsShownInEditor = '';
/**
 * The last change the reader can undo, a removal of files or a link followed, as the hint says
 * it, and what undoes it, until the reader edits the code again, or, if it changed the settings,
 * the settings.
 */
let lastChange: { said: string; undo: () => void; ofSettings?: true } | null = null;

/** Lists names in prose, as `a, b, and c`. */
const PROSE_LIST = new Intl.ListFormat('en');

/** The view the reader last looked at, which a link to the page shows. */
let selectedView: View = openingState.view;

/** Gives the value of `source`, a control or its copy, to `target`, the other. */
function copyValue(source: Control, target: Control): void {
  if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
    target.checked = source.checked;
  } else {
    target.value = source.value;
  }
}

for (const [control, copy] of copiedControls) {
  control.addEventListener('change', () => copyValue(control, copy));
  copy.addEventListener('change', () => {
    copyValue(copy, control);
    control.dispatchEvent(new Event('change'));
  });
}

autorunCheckbox.checked = readStored(AUTORUN_STORAGE_KEY) !== 'off';
// Before the settings, which mark the menu if it differs from its default.
timeLimitInput.value = String(parseTimeLimit(readStored(TIME_LIMIT_STORAGE_KEY)));
applySettings(openingState);
// The compiler, the longest download, loads while the editor does.
compiler.startLoading();

/** The files of the program as they are now, as JSON, to tell a change of them from another. */
let filesShown = '';

/** The editors, one per file, holding the code, and the panels of the views. */
const dock = new PlaygroundDock(
  elementById('pg-dock'),
  openingState.files,
  openingState.active,
  VIEWS,
  openingState.view,
  {
  onEdit: codeEdited,
  onRun: () => void compileAndRun(),
  onFilesChange: () => {
    scheduleSave();
    // Adding, removing or renaming a file, or replacing code, changes the program; showing another
    // file does not.
    const files = JSON.stringify(dock.files);
    if (files !== filesShown) codeEdited();
  },
  onRemove: (names, undo) => {
    lastChange = { said: `Removed ${PROSE_LIST.format(names)}.`, undo };
    updateHint();
  },
  onViewVisibility: (view, visible) => {
    panes.get(view)!.setVisible(visible);
    if (!visible || view === selectedView) return;
    selectedView = view;
    scheduleSave();
  },
  },
);
filesShown = JSON.stringify(dock.files);

/** What the page's requests produced, a pane per view, each rendering its view while it shows. */
const panes = new Map(
  VIEWS.map((view) => [
    view,
    new ResultPane(
      {
        panel: dock.viewPanel(view),
        tabs: [dock.viewTab(view)],
        stageStrip: view === 'result' ? elementById('pg-stages') : undefined,
        renderView: (container, view, result) =>
          renderView(container, view, result, {
            onReveal: (diagnostic) => dock.reveal(diagnostic),
            canReveal: (diagnostic) => dock.contains(diagnostic),
          }),
      },
      view,
    ),
  ]),
);
for (const [view, pane] of panes) pane.setVisible(dock.isViewVisible(view));

/** The panes, as one, for what concerns them all. */
const allPanes = {
  showCompilerStatus: (status: CompilerStatus) => {
    for (const pane of panes.values()) pane.showCompilerStatus(status);
  },
  get isShowingResult() {
    return [...panes.values()].some((pane) => pane.isShowingResult);
  },
  showProgress: (progress: Result) => {
    for (const pane of panes.values()) void pane.showProgress(progress);
  },
  showAnswer: (answer: Result) => {
    for (const pane of panes.values()) void pane.showAnswer(answer);
  },
};

/** How many errors the diagnostics have, in the tab of the diagnostics. */
const errorCountBadge = document.createElement('span');
errorCountBadge.className = 'count';
dock.viewTab('diagnostics').append(errorCountBadge);

/** Saves the code, and runs it unless auto-run is off, once the reader has edited it. */
function codeEdited(): void {
  filesShown = JSON.stringify(dock.files);
  linkProblem = undefined;
  if (lastChange) {
    lastChange = null;
    updateHint();
  }
  scheduleSave();
  if (autorunCheckbox.checked) {
    scheduleCompileAndRun();
  } else {
    markStale();
  }
}

/** Sets the controls to `settings`. */
function applySettings(settings: CompileSettings): void {
  optimizationSelect.value = String(settings.optimization);
  stopAfterSelect.value = settings.stopAfter ?? '';
  standardLibraryCheckbox.checked = settings.standardLibrary;
  for (const [control, copy] of copiedControls) copyValue(control, copy);
  markMoreMenuIfModified();
}

/** Marks the "More options" button iff a setting in its menu differs from its default. */
function markMoreMenuIfModified(): void {
  moreMenuButton.toggleAttribute(
    'data-modified',
    stopAfterSelect.value !== '' ||
      !standardLibraryCheckbox.checked ||
      parseTimeLimit(timeLimitInput.value) !== DEFAULT_TIME_LIMIT,
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
  return {
    files: dock.files,
    // The first file, shown by default, needs no saying.
    active: dock.active === dock.files[0].name ? undefined : dock.active,
    ...currentSettings(),
    view: selectedView,
  };
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
  const { files, active: _, view: __, ...settings } = currentState();
  return compileRequest(files, ARTIFACT_VIEWS, settings);
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
    timeLimit: parseTimeLimit(timeLimitInput.value),
    onProgress: (progress) => {
      allPanes.showProgress(progress);
      showDiagnosticsOf(progress);
    },
  });
  // Superseded: the newer request shows what it does.
  if (result === null) return;
  latestRequest = null;
  runButton.removeAttribute('aria-busy');
  allPanes.showAnswer(result);
  // The code or the settings may have changed while this was compiled.
  document.body.toggleAttribute(
    'data-stale',
    JSON.stringify(request) !== JSON.stringify(currentRequest()),
  );
  showDiagnosticsOf(result);
  statusLine.textContent = summarize(result, true);
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
  dock.showDiagnostics(diagnostics);
  const errors = countErrors(diagnostics);
  errorCountBadge.textContent = errors > 0 ? String(errors) : '';
}

/** Marks what is shown as behind the code, if anything is shown. */
function markStale(): void {
  if (!allPanes.isShowingResult) return;
  document.body.toggleAttribute('data-stale', true);
  updateHint();
}

/**
 * Says what the reader should know: a link that did not open, the last change they can undo, or
 * how to run the code.
 */
function updateHint(): void {
  // A link that did not open is said first, over what can be undone.
  if (lastChange && linkProblem === undefined) {
    const { said, undo } = lastChange;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'undo';
    button.textContent = 'Undo';
    button.addEventListener('click', () => {
      lastChange = null;
      undo();
      updateHint();
    });
    hintLine.replaceChildren(`${said} `, button);
    return;
  }
  const stale = document.body.hasAttribute('data-stale');
  hintLine.textContent =
    linkProblem ??
    (autorunCheckbox.checked
      ? ''
      : stale
        ? `Edited since it last ran: press Run or ${RUN_SHORTCUT.text}.`
        : `Auto-run is off: press Run or ${RUN_SHORTCUT.text} to run.`);
}

/**
 * Shows the tabs of the views that requests can produce with the final phase chosen, and only
 * those (see `PlaygroundDock.setAvailableViews`).
 */
function updateAvailableViews(): void {
  const stopAfter = parsePhase(stopAfterSelect.value);
  dock.setAvailableViews((view) => canProduce(view, stopAfter));
  // A view in a group hidden as none of its views can be produced is not one a link should show:
  // the result is. (A view another shows in place of is selected as it is shown.)
  if (!canProduce(selectedView, stopAfter)) {
    selectedView = 'result';
    scheduleSave();
  }
}
updateAvailableViews();

/**
 * Opens the state in `location.hash`, if it holds one, when a link to the page is followed from
 * the page itself, replacing the program (see `PlaygroundDock.setFiles`).
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
  const { files, active, view } = linked.state;
  // A link to what is shown, such as one followed twice, changes nothing to undo.
  const linkedActive = active === files[0].name ? undefined : active;
  if (serialize({ ...linked.state, active: linkedActive }) === serialize(currentState())) {
    updateHint();
    return;
  }
  const before = {
    files: dock.files,
    active: dock.active,
    settings: currentSettings(),
    view: selectedView,
  };
  const open = (state: typeof before): void => {
    applySettings(state.settings);
    // Its files removed are said as the link's, not on their own.
    dock.setFiles(state.files, state.active, false);
    dock.showView(state.view);
    // Even if shown in a group of its own already, which dockview then says nothing of.
    selectedView = state.view;
    updateAvailableViews();
    void compileAndRun();
  };
  open({ files, active, settings: linked.state, view });
  // After the change of the code, which forgets the change before.
  lastChange = { said: 'Opened the link.', undo: () => open(before), ofSettings: true };
  updateHint();
}

// Loading is shown until there is a result to show instead.
showCompilerStatus(compiler, allPanes, statusLine);

for (const select of examplesSelects) {
  for (const example of EXAMPLES) select.add(new Option(example.name, example.name));
  select.addEventListener('change', () => {
    const example = EXAMPLES.find((candidate) => candidate.name === select.value);
    select.value = '';
    if (!example) return;
    dock.setFiles([{ name: DEFAULT_FILE_NAME, contents: example.source }]);
    dock.focus();
  });
}
stopAfterSelect.addEventListener('change', updateAvailableViews);
for (const control of [optimizationSelect, stopAfterSelect, standardLibraryCheckbox]) {
  control.addEventListener('change', () => {
    // Undoing a change of the settings before would undo this too.
    if (lastChange?.ofSettings) {
      lastChange = null;
      updateHint();
    }
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
timeLimitInput.addEventListener('change', () => {
  // What was typed, as the limit it gives: a whole number of seconds within the bounds.
  timeLimitInput.value = String(parseTimeLimit(timeLimitInput.value));
  store(TIME_LIMIT_STORAGE_KEY, timeLimitInput.value);
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
newFileButton.addEventListener('click', () => {
  moreMenu.hidePopover();
  dock.addFile();
});
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
