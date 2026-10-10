/**
 * The full-screen playground (`src/pages/playground.astro`): an editor filling half the window,
 * every view of the compilation in the other half, recompiled as the reader types unless they turn
 * auto-run off.
 *
 * Its state, the code, the optimization level and the view shown, opens from a link (see
 * `share.ts`), and is otherwise remembered from the reader's last visit.
 */
import { compiler, type Result } from './compiler';
import { createEditor, type Editor } from './editor';
import { EXAMPLES } from './examples';
import { describeStatus, renderOutput, renderStatus, summarize } from './outputs';
import {
  decode,
  encode,
  isOptimizationLevel,
  playgroundURL,
  type PlaygroundState,
} from './share';
import { connectTabs } from './tabs';
import type { Output } from './views';

/** Where the state of the last visit is kept, as `share.ts` encodes it. */
const STATE_KEY = 'hylo-playground:state';
/** Where the reader's choice of auto-run is kept: `"off"` or absent. */
const AUTORUN_KEY = 'hylo-playground:autorun';
/** How long typing must pause before the code is compiled. */
const AUTORUN_DELAY_MILLISECONDS = 400;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const view = $<HTMLElement>('pg-view');
const optimization = $<HTMLSelectElement>('pg-optimization');
const examples = $<HTMLSelectElement>('pg-examples');
const autorun = $<HTMLInputElement>('pg-autorun');
const share = $<HTMLButtonElement>('pg-share');
const status = $<HTMLElement>('pg-status');
const hint = $<HTMLElement>('pg-hint');

/** How the shortcut running the code is written on this platform. */
const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ ↵' : 'Ctrl ↵';
for (const k of document.querySelectorAll<HTMLElement>('[data-shortcut]')) k.textContent = shortcut;
$('pg-run').title = `Compile and run (${shortcut.replace(' ↵', '+Enter')})`;

/** Reads `key` from local storage, which may be unavailable. */
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes `value` to local storage, if it is available. */
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering is fine.
  }
}

/**
 * The state the page opens with, and what to tell the reader about it: a link's, else the last
 * visit's, else the first example's.
 */
async function initialState(): Promise<{ state: PlaygroundState; problem?: string }> {
  const fallback = async (): Promise<PlaygroundState> => {
    const remembered = await decode(recall(STATE_KEY) ?? '');
    if (remembered && 'state' in remembered) return remembered.state;
    return { source: EXAMPLES[0].source, optimization: 0, view: 'result' };
  };
  const linked = await decode(location.hash);
  if (linked === null) return { state: await fallback() };
  // The link has done its job; a reload should show what has been done since.
  history.replaceState(null, '', location.pathname + location.search);
  return 'state' in linked ? linked : { state: await fallback(), problem: linked.problem };
}

const initial = await initialState();
optimization.value = String(initial.state.optimization);
autorun.checked = recall(AUTORUN_KEY) !== 'off';
let shown: Output = initial.state.view;
/** Why the link the page was opened with could not be read, until the reader edits the code. */
let linkProblem = initial.problem;
let result: Result | null = null;
/** Incremented whenever a view is asked for, so that a stale rendering is dropped. */
let generation = 0;

const editor: Editor = await createEditor($('pg-editor'), {
  value: initial.state.source,
  onChange: () => {
    linkProblem = undefined;
    saveState();
    if (autorun.checked) {
      schedule(compile, AUTORUN_DELAY_MILLISECONDS);
    } else if (result !== null) {
      document.body.toggleAttribute('data-stale', true);
      updateHint();
    }
  },
  onRun: () => void compile(),
});

/** The state of the page now. */
function currentState(): PlaygroundState {
  const level = Number(optimization.value);
  return {
    source: editor.value,
    optimization: isOptimizationLevel(level) ? level : 0,
    view: shown,
  };
}

let saving: ReturnType<typeof setTimeout> | undefined;
/** Remembers the state for the next visit, once edits pause. */
function saveState(): void {
  clearTimeout(saving);
  saving = setTimeout(async () => remember(STATE_KEY, await encode(currentState())), 300);
}

/** The run scheduled by the last edits, if it has not started. */
let timer: ReturnType<typeof setTimeout> | undefined;
/** Calls `f` after `delay` milliseconds, unless this is called again before. */
function schedule(f: () => Promise<void>, delay: number): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void f();
  }, delay);
}

/**
 * Compiles and runs the editor's code, and shows the result. A request still waiting when a newer
 * one is made is dropped, so that typing never queues up stale work.
 */
async function compile(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  const { source, optimization } = currentState();
  document.body.toggleAttribute('data-compiling', true);
  $('pg-run').toggleAttribute('aria-busy', true);
  const r = await compiler.compile(
    { source, emit: ['raw-ir', 'ir', 'llvm', 'assembly', 'executable'], optimization },
    { key: 'full-screen' },
  );
  if (r === null) return;
  document.body.removeAttribute('data-compiling');
  // Edited while compiling: what is shown is already behind the code.
  document.body.toggleAttribute('data-stale', source !== editor.value);
  $('pg-run').removeAttribute('aria-busy');
  result = r;
  editor.showDiagnostics(r.compile.diagnostics);
  const errors = r.compile.diagnostics.filter((d) => d.level === 'error').length;
  $('pg-error-count').textContent = errors > 0 ? String(errors) : '';
  const timing =
    r.gaveUp || r.compile.error ? '' : ` Compiled in ${r.compile.milliseconds.toFixed(0)} ms.`;
  status.textContent = summarize(r) + timing;
  updateHint();
  await show(shown);
}

/** Says what the reader should know: a link that did not open, or how to run the code. */
function updateHint(): void {
  const stale = document.body.hasAttribute('data-stale');
  hint.textContent = linkProblem
    ? linkProblem
    : autorun.checked
    ? ''
    : stale
      ? `Edited since it last ran: press Run or ${shortcut.replace(' ↵', '+Enter')}.`
      : `Auto-run is off: press Run or ${shortcut.replace(' ↵', '+Enter')} to run.`;
}

const select = connectTabs($('pg-tabs'), view, (o) => void show(o));

async function show(output: Output): Promise<void> {
  if (output !== shown) {
    shown = output;
    saveState();
  }
  select(output);
  if (!result) return;
  const g = ++generation;
  const rendered = document.createElement('div');
  await renderOutput(rendered, output, result, { onReveal: (l, c) => editor.reveal(l, c) });
  if (g === generation) view.replaceChildren(...rendered.childNodes);
}
select(shown);

compiler.watch((s) => {
  if (s.kind === 'ready' || result !== null) return;
  renderStatus(view, s);
  status.textContent = describeStatus(s) ?? '';
});

for (const e of EXAMPLES) examples.add(new Option(e.name, e.name));
examples.addEventListener('change', () => {
  const e = EXAMPLES.find((x) => x.name === examples.value);
  examples.value = '';
  if (!e) return;
  // Through the editor, so that the change is one the reader can undo.
  editor.replace(e.source);
  editor.focus();
});
optimization.addEventListener('change', () => {
  saveState();
  void compile();
});
autorun.addEventListener('change', () => {
  remember(AUTORUN_KEY, autorun.checked ? 'on' : 'off');
  // A run the last edits scheduled is not one the reader still wants.
  if (!autorun.checked && timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
    document.body.toggleAttribute('data-stale', result !== null);
  }
  if (autorun.checked && document.body.hasAttribute('data-stale')) void compile();
  updateHint();
});
$('pg-run').addEventListener('click', () => void compile());

let shareReset: ReturnType<typeof setTimeout> | undefined;
share.addEventListener('click', async () => {
  const url = new URL(await playgroundURL(currentState()), location.href).href;
  let copied = true;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // No clipboard here (an insecure origin, or permission refused): the reader copies it.
    copied = false;
    prompt('Copy this link to share the code:', url);
  }
  if (!copied) return;
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
