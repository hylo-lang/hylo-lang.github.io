/**
 * The full-screen playground's script (`src/pages/playground.astro`, whose elements it expects by
 * their ids): an editor filling half the window, every view of the compilation in the other half,
 * recompiled as the reader types unless they turn auto-run off.
 *
 * Its state (see `PlaygroundState`) opens from a link (see `share.ts`), on load or when the link
 * is followed from the page itself, and is otherwise the one remembered from the reader's last
 * visit. A link, once opened, is removed from the address bar and its state remembered, so that a
 * reload shows what the reader has done since.
 */
import type { CompileRequest } from '@hylo-lang/hylo-wasm/protocol';
import { compiler, type Result } from './compiler';
import { createEditor, type Editor } from './editor';
import { EXAMPLES } from './examples';
import { errorCount, failure, renderOutput, summarize, watchStatus } from './outputs';
import {
  compileRequest,
  parseOptimizationLevel,
  parsePhase,
  type CompileSettings,
} from './settings';
import { DEFAULT_STATE, playgroundURL, serialize, type PlaygroundState } from './share';
import { decodeFragment, deserialize, type Decoded } from './share-reader';
import { connectTabs } from './tabs';
import { isArtifact, OUTPUTS, type Output } from './views';

/** Where the state of the last visit is kept, as `serialize` writes it. */
const STATE_KEY = 'hylo-playground:state';
/** Where the reader's choice of auto-run is kept: `"off"`, or anything else for on. */
const AUTORUN_KEY = 'hylo-playground:autorun';
/** How long typing must pause before the code is compiled. */
const AUTORUN_DELAY_MILLISECONDS = 400;
/** How long changes must pause before the state is remembered. */
const SAVE_DELAY_MILLISECONDS = 300;
/** What every compilation produces, besides an executable: every artifact a view shows. */
const ARTIFACTS = OUTPUTS.filter(isArtifact);
/** The key of the page's requests, each of which replaces the last if it is still waiting. */
const REQUEST_KEY = 'full-screen';
/** The state of a first visit. */
const FIRST_STATE: PlaygroundState = { source: EXAMPLES[0].source, ...DEFAULT_STATE };

/** Returns the element whose id is `id`, which the page has. */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
// The page's elements.
const view = $<HTMLElement>('pg-view');
const optimization = $<HTMLSelectElement>('pg-optimization');
const stopAfter = $<HTMLSelectElement>('pg-stop-after');
const standardLibrary = $<HTMLInputElement>('pg-standard-library');
const moreButton = $<HTMLButtonElement>('pg-more-button');
const more = $<HTMLElement>('pg-more');
const examples = $<HTMLSelectElement>('pg-examples');
const autorun = $<HTMLInputElement>('pg-autorun');
const run = $<HTMLButtonElement>('pg-run');
const share = $<HTMLButtonElement>('pg-share');
const status = $<HTMLElement>('pg-status');
const hint = $<HTMLElement>('pg-hint');

/** The shortcut running the code on this platform, as keys and as text. */
const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform)
  ? { keys: '⌘ ↵', text: '⌘+Enter' }
  : { keys: 'Ctrl ↵', text: 'Ctrl+Enter' };
for (const k of document.querySelectorAll<HTMLElement>('[data-shortcut]')) k.textContent = SHORTCUT.keys;
run.title = `Compile and run (${SHORTCUT.text})`;

/** Returns the value stored under `key` in local storage, or `null` if none is, or it is unavailable. */
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value` under `key` in local storage, if it is available. */
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering is fine.
  }
}

/**
 * Returns the state in `location.hash`, or why it holds none, or `null` if it does not try to
 * hold one; removes it from the address bar and remembers its state, so that a reload shows what
 * the reader does from then on.
 */
function takeLinkedState(): Decoded | null {
  const linked = decodeFragment(location.hash);
  if (linked === null) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if ('state' in linked) remember(STATE_KEY, serialize(linked.state));
  return linked;
}

/** Returns the state remembered from the last visit, or that of a first visit. */
function rememberedState(): PlaygroundState {
  const stored = recall(STATE_KEY);
  const remembered = stored === null ? null : deserialize(stored);
  return remembered !== null && 'state' in remembered ? remembered.state : FIRST_STATE;
}

/** The link the page was opened with, if any. */
const linked = takeLinkedState();
/** The state the page opens with. */
const initial = linked !== null && 'state' in linked ? linked.state : rememberedState();
/** Why the last link the page was opened with could not be read, until the reader edits the code. */
let linkProblem = linked !== null && 'problem' in linked ? linked.problem : undefined;
/** The view shown. */
let shown: Output = initial.view;
/** What the code did when it last ran. */
let result: Result | null = null;
/** Incremented whenever a view is asked for, so that a stale rendering is dropped. */
let generation = 0;
/** How many of the page's requests are waiting for the compiler or being served. */
let pending = 0;

setSettings(initial);
autorun.checked = recall(AUTORUN_KEY) !== 'off';
// The compiler, the longest download, loads while the editor does.
compiler.start();

/** The editor, holding the code. */
const editor: Editor = await createEditor($('pg-editor'), {
  value: initial.source,
  onChange: () => {
    linkProblem = undefined;
    scheduleSave();
    if (autorun.checked) {
      scheduleCompile();
    } else {
      markStale();
    }
  },
  onRun: () => void compile(),
});

/** Sets the controls to the settings of `settings`. */
function setSettings(settings: CompileSettings): void {
  optimization.value = String(settings.optimization);
  stopAfter.value = settings.stopAfter ?? '';
  standardLibrary.checked = settings.standardLibrary;
  markModifiedOptions();
}

/** Marks the "More options" button iff a setting in its menu differs from its default. */
function markModifiedOptions(): void {
  moreButton.toggleAttribute('data-modified', stopAfter.value !== '' || !standardLibrary.checked);
}

/** Places the "More options" menu under its button, within the window. */
function placeMenu(): void {
  const button = moreButton.getBoundingClientRect();
  const margin = 8;
  more.style.top = `${button.bottom + 6}px`;
  more.style.left = `${Math.max(margin, Math.min(button.left, innerWidth - more.offsetWidth - margin))}px`;
}

/** Returns the settings the controls are set to. */
function currentSettings(): CompileSettings {
  return {
    optimization: parseOptimizationLevel(optimization.value),
    standardLibrary: standardLibrary.checked,
    stopAfter: parsePhase(stopAfter.value),
  };
}

/** Returns the state of the page now. */
function currentState(): PlaygroundState {
  return { source: editor.value, ...currentSettings(), view: shown };
}

/** The save the last changes scheduled, if it has not happened. */
let saving: ReturnType<typeof setTimeout> | undefined;
/** Remembers the state for the next visit once changes pause, or when the page is left. */
function scheduleSave(): void {
  clearTimeout(saving);
  saving = setTimeout(save, SAVE_DELAY_MILLISECONDS);
}

/** Remembers the state for the next visit now. */
function save(): void {
  clearTimeout(saving);
  saving = undefined;
  remember(STATE_KEY, serialize(currentState()));
}

/** The compilation the last edits scheduled, if it has not started. */
let timer: ReturnType<typeof setTimeout> | undefined;
/** Compiles once typing pauses, unless this is called again before. */
function scheduleCompile(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void compile();
  }, AUTORUN_DELAY_MILLISECONDS);
}

/** Returns the request compiling the page's code with its settings now. */
function currentRequest(): CompileRequest {
  const { source, ...settings } = currentState();
  return compileRequest(source, ARTIFACTS, settings);
}

/**
 * Compiles the code with the settings as they are now, runs it if it is a program, and shows
 * what it did. A request still waiting when a newer one is made is dropped, so that typing never
 * queues up stale work; the page is busy until no request is pending. Never rejects.
 */
async function compile(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  const request = currentRequest();
  ++pending;
  setBusy(true);
  let r: Result | null;
  try {
    r = await compiler.compile(request, { key: REQUEST_KEY });
  } finally {
    if (--pending === 0) setBusy(false);
  }
  if (r === null) return;
  result = r;
  // The code or the settings may have changed while this compiled.
  document.body.toggleAttribute(
    'data-stale',
    JSON.stringify(request) !== JSON.stringify(currentRequest()),
  );
  editor.showDiagnostics(r.compile.diagnostics);
  const errors = errorCount(r.compile.diagnostics);
  $('pg-error-count').textContent = errors > 0 ? String(errors) : '';
  const timing =
    failure(r) === undefined ? ` Compiled in ${r.compile.milliseconds.toFixed(0)} ms.` : '';
  status.textContent = summarize(r) + timing;
  updateHint();
  await show(shown);
}

/** Marks the page as busy compiling, or not. */
function setBusy(busy: boolean): void {
  document.body.toggleAttribute('data-compiling', busy);
  run.toggleAttribute('aria-busy', busy);
}

/** Marks what is shown as behind the code, if anything is shown. */
function markStale(): void {
  if (result === null) return;
  document.body.toggleAttribute('data-stale', true);
  updateHint();
}

/** Says what the reader should know: a link that did not open, or how to run the code. */
function updateHint(): void {
  const stale = document.body.hasAttribute('data-stale');
  hint.textContent =
    linkProblem ??
    (autorun.checked
      ? ''
      : stale
        ? `Edited since it last ran: press Run or ${SHORTCUT.text}.`
        : `Auto-run is off: press Run or ${SHORTCUT.text} to run.`);
}

/** Marks a view as the selected tab. */
const select = connectTabs($('pg-tabs'), view, (o) => void show(o));

/** Selects the `output` view, and shows it if the code has run. */
async function show(output: Output): Promise<void> {
  if (output !== shown) {
    shown = output;
    scheduleSave();
  }
  select(output);
  if (!result) return;
  const g = ++generation;
  const rendered = document.createElement('div');
  await renderOutput(rendered, output, result, { onReveal: (l, c) => editor.reveal(l, c) });
  if (g === generation) view.replaceChildren(...rendered.childNodes);
}
select(shown);

/**
 * Opens the state in `location.hash`, if it holds one, when a link to the page is followed from
 * the page itself: the code replaces the editor's as an edit the reader can undo.
 */
function openLinkedState(): void {
  const linked = takeLinkedState();
  if (linked === null) return;
  if ('problem' in linked) {
    linkProblem = linked.problem;
    updateHint();
    return;
  }
  linkProblem = undefined;
  setSettings(linked.state);
  editor.replace(linked.state.source);
  void show(linked.state.view);
  void compile();
}

// Loading is shown until there is a result to show instead.
watchStatus(compiler, view, status, () => result === null);

for (const e of EXAMPLES) examples.add(new Option(e.name, e.name));
examples.addEventListener('change', () => {
  const e = EXAMPLES.find((x) => x.name === examples.value);
  examples.value = '';
  if (!e) return;
  // Through the editor, so that the change is one the reader can undo.
  editor.replace(e.source);
  editor.focus();
});
for (const control of [optimization, stopAfter, standardLibrary]) {
  control.addEventListener('change', () => {
    markModifiedOptions();
    scheduleSave();
    void compile();
  });
}
more.addEventListener('toggle', (e) => {
  if ((e as ToggleEvent).newState === 'open') placeMenu();
});
addEventListener('resize', () => {
  if (more.matches(':popover-open')) placeMenu();
});
autorun.addEventListener('change', () => {
  remember(AUTORUN_KEY, autorun.checked ? 'on' : 'off');
  if (autorun.checked) {
    if (document.body.hasAttribute('data-stale')) void compile();
  } else if (timer !== undefined) {
    // A compilation the last edits scheduled is not one the reader still wants.
    clearTimeout(timer);
    timer = undefined;
    markStale();
  }
  updateHint();
});
run.addEventListener('click', () => void compile());
addEventListener('hashchange', openLinkedState);
// Edits made just before leaving are remembered too.
addEventListener('pagehide', () => {
  if (saving !== undefined) save();
});

/** Puts the Share button back as it was, once it has said the link was copied. */
let shareReset: ReturnType<typeof setTimeout> | undefined;
share.addEventListener('click', async () => {
  const url = new URL(playgroundURL(currentState()), location.href).href;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // No clipboard here (an insecure origin, or permission refused): the reader copies it.
    prompt('Copy this link to share the code:', url);
    return;
  }
  $('pg-share-label').textContent = 'Link copied';
  share.toggleAttribute('data-done', true);
  clearTimeout(shareReset);
  shareReset = setTimeout(() => {
    $('pg-share-label').textContent = 'Share';
    share.removeAttribute('data-done');
  }, 2000);
});

updateHint();
// The page opens on what the code does, whether or not it runs as the reader types.
void compile();
