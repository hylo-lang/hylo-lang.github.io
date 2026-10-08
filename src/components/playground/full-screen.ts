/**
 * The full-screen playground (`src/pages/playground.astro`): an editor filling half the window,
 * every view of the compilation in the other half, recompiled as the reader types.
 */
import { compiler } from './compiler';
import { createEditor, type Editor } from './editor';
import { EXAMPLES } from './examples';
import { describeStatus, renderOutput, renderStatus, summarize } from './outputs';
import type { Result } from './protocol';
import { decodeOptimization, decodeSource, playgroundURL } from './source-link';
import { connectTabs } from './tabs';
import type { Output } from './views';

const STORAGE_KEY = 'hylo-playground:source';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const view = $<HTMLElement>('pg-view');
const optimization = $<HTMLSelectElement>('pg-optimization');
const examples = $<HTMLSelectElement>('pg-examples');

const status = $<HTMLElement>('pg-status');

let shown: Output = 'result';
let result: Result | null = null;
/** Incremented whenever a view is asked for, so that a stale rendering is dropped. */
let generation = 0;

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

/** The code the page opens with: a link's, else what was last typed here, else an example. */
async function initialSource(): Promise<string> {
  const linked = await decodeSource(location.hash);
  const level = decodeOptimization(location.hash);
  if (level !== null) optimization.value = String(level);
  if (linked !== null) {
    // The link has done its job; a reload should show what has been typed since.
    history.replaceState(null, '', location.pathname + location.search);
    return linked;
  }
  return recall(STORAGE_KEY) ?? EXAMPLES[0].source;
}

const editor: Editor = await createEditor($('pg-editor'), {
  value: await initialSource(),
  onChange: (value) => {
    remember(STORAGE_KEY, value);
    scheduleCompile();
  },
  onRun: () => void compile(),
});

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleCompile(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void compile(), 400);
}

/**
 * Compiles and runs the editor's code, and shows the result. A request still waiting when a newer
 * one is made is dropped, so that typing never queues up stale work.
 */
async function compile(): Promise<void> {
  clearTimeout(timer);
  document.body.toggleAttribute('data-compiling', true);
  const r = await compiler.compile(
    {
      source: editor.value,
      emit: ['raw-ir', 'ir', 'llvm', 'assembly', 'executable'],
      optimization: Number(optimization.value),
    },
    { key: 'full-screen' },
  );
  if (r === null) return;
  document.body.removeAttribute('data-compiling');
  result = r;
  editor.showDiagnostics(r.compile.diagnostics ?? []);
  const errors = (r.compile.diagnostics ?? []).filter((d) => d.level === 'error').length;
  $('pg-error-count').textContent = errors > 0 ? String(errors) : '';
  const timing = r.compile.milliseconds !== undefined ? ` Compiled in ${r.compile.milliseconds.toFixed(0)} ms.` : '';
  status.textContent = summarize(r) + timing;
  await show(shown);
}

const select = connectTabs($('pg-tabs'), view, (o) => void show(o));

async function show(output: Output): Promise<void> {
  shown = output;
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
});
optimization.addEventListener('change', () => void compile());
$('pg-run').addEventListener('click', () => void compile());
$('pg-share').addEventListener('click', async () => {
  const url = new URL(await playgroundURL(editor.value, Number(optimization.value)), location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    $('pg-share').textContent = 'Link copied';
  } catch {
    // No clipboard here (an insecure origin, say): the address bar carries the link instead.
    history.replaceState(null, '', url);
    $('pg-share').textContent = 'Link in the address bar';
  }
  setTimeout(() => ($('pg-share').textContent = 'Share'), 2000);
});

void compile();
