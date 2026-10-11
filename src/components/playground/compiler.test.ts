// The page's compiler against scripted workers: the order of their messages, and of the page's
// requests and aborts, cannot mix up which answer is whose.

import type {
  Compilation,
  CompilerWorkerMessage,
  CompilerWorkerRequest,
  ProgramWorkerRequest,
  ProgramWorkerResult,
} from '@hylo-lang/hylo-wasm/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Compiler, type CompilerStatus, type Result } from './compiler';

/** A worker that records what it is sent, and says what a test makes it say. */
class ScriptedWorker<Request, Message> {
  sent: Request[] = [];
  terminated = false;
  onmessage: ((event: { data: Message }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  postMessage(request: Request): void {
    this.sent.push(request);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Reports an uncaught error in the worker, saying `message`. */
  fail(message: string): void {
    this.onerror?.({ message });
  }
  /** Delivers `message`, as a browser would even after `terminate`, if it was already queued. */
  say(message: Message): void {
    this.onmessage?.({ data: message });
  }
}

/** A compiler worker. */
class ScriptedCompilerWorker extends ScriptedWorker<CompilerWorkerRequest, CompilerWorkerMessage> {
  ready(): void {
    this.say({ type: 'ready', standardLibraryMilliseconds: 1 });
  }
  /** Answers request `id`, compiled with `irMarker` as its IR, and with an executable if `executable`. */
  answer(
    id: number,
    irMarker: string,
    { executable = false, ...extra }: Partial<Compilation> & { executable?: boolean } = {},
  ): void {
    const compilation = { diagnostics: [], artifacts: { ir: irMarker }, milliseconds: 1, ...extra };
    this.say({
      type: 'result',
      id,
      compilation,
      execution: null,
      ...(executable && { executable: new Uint8Array([0]) }),
    });
  }
}

/** A program worker. */
class ScriptedProgramWorker extends ScriptedWorker<ProgramWorkerRequest, ProgramWorkerResult> {
  /** Says request `id`'s program exited with `exitCode`. */
  exit(id: number, exitCode: number): void {
    this.say({ type: 'ran', id, execution: { exitCode, stdout: '', stderr: '' } });
  }
}

let compilerWorkers: ScriptedCompilerWorker[];
let programWorkers: ScriptedProgramWorker[];
let compiler: Compiler;
beforeEach(() => {
  vi.useFakeTimers();
  compilerWorkers = [];
  programWorkers = [];
  compiler = new Compiler({
    createCompilerWorker: () => {
      const worker = new ScriptedCompilerWorker();
      compilerWorkers.push(worker);
      return worker as unknown as Worker;
    },
    createProgramWorker: () => {
      const worker = new ScriptedProgramWorker();
      programWorkers.push(worker);
      return worker as unknown as Worker;
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A request compiling to Hylo IR only, which runs nothing. */
const irOnly = { source: 'fun f() {}', emit: ['ir' as const] };
/** A request compiling a program and running it. */
const program = { source: 'public fun main() {}' };
/** Returns the IR of `result`, which these tests use to tell answers apart. */
const irMarker = (result: Result | null) => result?.compilation.artifacts.ir;
/** Returns the ids of the requests `worker` was sent. */
const idsSentTo = (worker: { sent: { id: number }[] }) => worker.sent.map((request) => request.id);

test('answers requests in order, one at a time', async () => {
  const a = compiler.compileAndRun(irOnly);
  const b = compiler.compileAndRun(irOnly);
  const [worker] = compilerWorkers;
  worker.ready();
  expect(idsSentTo(worker)).toEqual([1]);
  worker.answer(1, 'a');
  expect(idsSentTo(worker)).toEqual([1, 2]);
  worker.answer(2, 'b');
  expect([irMarker(await a), irMarker(await b)]).toEqual(['a', 'b']);
});

test('runs a program in the program worker, and answers with what it did', async () => {
  const progress: Result[] = [];
  const answer = compiler.compileAndRun(program, { onProgress: (p) => progress.push(p) });
  const [worker] = compilerWorkers;
  worker.ready();
  expect(worker.sent[0].run).toBe(false);
  worker.answer(1, 'compiled', { executable: true });
  expect(progress.at(-1)?.stages).toEqual({ 'front-end': 'done', 'back-end': 'done', run: 'running' });
  const [programWorker] = programWorkers;
  expect(idsSentTo(programWorker)).toEqual([1]);
  programWorker.exit(1, 7);
  const result = await answer;
  expect(result?.execution?.exitCode).toBe(7);
  expect(irMarker(result)).toBe('compiled');
  expect(result?.stages).toEqual({ 'front-end': 'done', 'back-end': 'done', run: 'done' });
});

test('ignores a result about another request', async () => {
  const answer = compiler.compileAndRun(irOnly);
  const [worker] = compilerWorkers;
  worker.ready();
  worker.answer(7, 'stale');
  worker.answer(1, 'a');
  expect(irMarker(await answer)).toBe('a');
});

test('ignores a stage about no request being served', async () => {
  const answer = compiler.compileAndRun(irOnly);
  const [worker] = compilerWorkers;
  worker.ready();
  worker.answer(1, 'a');
  await answer;
  const compilation = { diagnostics: [], artifacts: {}, milliseconds: 1 };
  expect(() => worker.say({ type: 'stage', id: 1, stage: 'front-end', compilation })).not.toThrow();
});

test('a compiler worker terminated for taking too long cannot answer the next request', async () => {
  const slow = compiler.compileAndRun(irOnly, { timeLimit: 5 });
  const [old] = compilerWorkers;
  old.ready();
  vi.advanceTimersByTime(5000);
  expect((await slow)?.timedOut).toBe(5);
  expect((await slow)?.stages['front-end']).toBe('failed');
  expect(old.terminated).toBe(true);

  const next = compiler.compileAndRun(irOnly);
  const fresh = compilerWorkers[1];
  // The old worker's results, already queued when it was terminated, arrive late.
  old.answer(1, 'stale');
  old.answer(2, 'stale');
  fresh.ready();
  fresh.answer(2, 'b');
  expect(irMarker(await next)).toBe('b');
});

test('a program over the time limit is stopped, and the compiler stays loaded', async () => {
  const statuses: CompilerStatus['kind'][] = [];
  compiler.watchStatus((status) => statuses.push(status.kind));
  const answer = compiler.compileAndRun(program, { timeLimit: 5 });
  const [worker] = compilerWorkers;
  worker.ready();
  worker.answer(1, 'compiled', { executable: true });
  vi.advanceTimersByTime(5000);
  const result = await answer;
  expect(result?.timedOut).toBe(5);
  expect(irMarker(result)).toBe('compiled');
  expect(result?.stages.run).toBe('failed');
  expect(programWorkers[0].terminated).toBe(true);
  expect(worker.terminated).toBe(false);
  expect(statuses.at(-1)).toBe('ready');

  // The next request uses the same compiler, and a new program worker.
  const next = compiler.compileAndRun(program);
  worker.answer(2, 'next', { executable: true });
  programWorkers[0].exit(2, 1);
  programWorkers[1].exit(2, 0);
  expect((await next)?.execution?.exitCode).toBe(0);
});

test('a stage restarts the time limit, and what it produced is kept on giving up', async () => {
  const answer = compiler.compileAndRun({ ...program, emit: ['ir', 'executable'] }, { timeLimit: 5 });
  const [worker] = compilerWorkers;
  worker.ready();
  vi.advanceTimersByTime(4000);
  const compilation = { diagnostics: [], artifacts: { ir: 'front' }, milliseconds: 1 };
  worker.say({ type: 'stage', id: 1, stage: 'front-end', compilation });
  vi.advanceTimersByTime(4000);
  worker.answer(1, 'front', { executable: true });
  vi.advanceTimersByTime(4000);
  expect(programWorkers[0].terminated).toBe(false);
  vi.advanceTimersByTime(1000);
  const result = await answer;
  expect(result?.timedOut).toBeDefined();
  expect(irMarker(result)).toBe('front');
});

test('aborting a waiting request drops it before it is sent', async () => {
  const a = compiler.compileAndRun(irOnly);
  const abort = new AbortController();
  const b = compiler.compileAndRun(irOnly, { signal: abort.signal });
  const c = compiler.compileAndRun(irOnly);
  abort.abort();
  expect(await b).toBeNull();
  const [worker] = compilerWorkers;
  worker.ready();
  worker.answer(1, 'a');
  worker.answer(3, 'c');
  expect(idsSentTo(worker)).toEqual([1, 3]);
  expect([irMarker(await a), irMarker(await c)]).toEqual(['a', 'c']);
});

test('aborting a request being compiled drops what it reports, and lets the compilation finish', async () => {
  const abort = new AbortController();
  const progress: Result[] = [];
  const aborted = compiler.compileAndRun(program, {
    signal: abort.signal,
    onProgress: (p) => progress.push(p),
  });
  const next = compiler.compileAndRun(irOnly);
  const [worker] = compilerWorkers;
  worker.ready();
  const reportsBeforeAbort = progress.length;
  abort.abort();
  expect(await aborted).toBeNull();
  const compilation = { diagnostics: [], artifacts: { ir: 'a' }, milliseconds: 1 };
  worker.say({ type: 'stage', id: 1, stage: 'front-end', compilation });
  expect(progress.length).toBe(reportsBeforeAbort);
  // The compiler is busy with it until it answers; its program is not run, and the next is sent.
  expect(idsSentTo(worker)).toEqual([1]);
  worker.answer(1, 'a', { executable: true });
  expect(programWorkers).toEqual([]);
  expect(idsSentTo(worker)).toEqual([1, 2]);
  worker.answer(2, 'b');
  expect(irMarker(await next)).toBe('b');
});

test('aborting a running program stops it at once, and serves the next request', async () => {
  const abort = new AbortController();
  const aborted = compiler.compileAndRun(program, { signal: abort.signal });
  const next = compiler.compileAndRun(program);
  const [worker] = compilerWorkers;
  worker.ready();
  worker.answer(1, 'a', { executable: true });
  const [running] = programWorkers;
  abort.abort();
  expect(await aborted).toBeNull();
  expect(running.terminated).toBe(true);
  expect(worker.terminated).toBe(false);
  expect(idsSentTo(worker)).toEqual([1, 2]);
  worker.answer(2, 'b', { executable: true });
  // The stopped program's answer, already queued, arrives late.
  running.exit(1, 1);
  running.exit(2, 1);
  programWorkers[1].exit(2, 0);
  const result = await next;
  expect(irMarker(result)).toBe('b');
  expect(result?.execution?.exitCode).toBe(0);
});

test('a request already aborted is never sent', async () => {
  const abort = new AbortController();
  abort.abort();
  expect(await compiler.compileAndRun(irOnly, { signal: abort.signal })).toBeNull();
  expect(compilerWorkers).toEqual([]);
});

test('after a compiler crash, the next request begins only once the compiler is ready again', async () => {
  const crashing = compiler.compileAndRun(irOnly);
  const progress: Result[] = [];
  const next = compiler.compileAndRun(irOnly, { onProgress: (p) => progress.push(p) });
  const [worker] = compilerWorkers;
  worker.ready();
  worker.answer(1, 'a', { error: 'crashed', compilerUnusable: true });
  await crashing;
  expect(progress.at(-1)?.stages['front-end']).toBe('waiting');
  worker.ready();
  expect(progress.at(-1)?.stages['front-end']).toBe('running');
  worker.answer(2, 'b');
  expect(irMarker(await next)).toBe('b');
});

test('a request aborted while the compiler loads is never compiled', async () => {
  const abort = new AbortController();
  const aborted = compiler.compileAndRun(irOnly, { signal: abort.signal });
  const next = compiler.compileAndRun(irOnly);
  abort.abort();
  expect(await aborted).toBeNull();
  const [worker] = compilerWorkers;
  expect(worker.sent).toEqual([]);
  worker.ready();
  expect(idsSentTo(worker)).toEqual([2]);
  worker.answer(2, 'b');
  expect(irMarker(await next)).toBe('b');
});

test('a compiler worker stopping unexpectedly answers its request with an error, not a load failure', async () => {
  const statuses: CompilerStatus['kind'][] = [];
  compiler.watchStatus((status) => statuses.push(status.kind));
  const crashed = compiler.compileAndRun(irOnly);
  const next = compiler.compileAndRun(irOnly);
  const [old] = compilerWorkers;
  old.ready();
  old.fail('out of memory');
  const result = await crashed;
  expect(result?.compilerUnavailable).toBeUndefined();
  expect(result?.compilation.error).toContain('out of memory');
  expect(statuses).not.toContain('failed');
  // The next request is served by a new worker.
  const fresh = compilerWorkers[1];
  fresh.ready();
  expect(idsSentTo(fresh)).toEqual([2]);
  fresh.answer(2, 'b');
  expect(irMarker(await next)).toBe('b');
});

test('a compiler worker that cannot load answers every request with the failure', async () => {
  const a = compiler.compileAndRun(irOnly);
  const b = compiler.compileAndRun(irOnly);
  compilerWorkers[0].fail('');
  for (const result of [await a, await b]) {
    expect(result?.compilerUnavailable).toBe('The compiler is not available on this site.');
  }
});

test('a program worker error answers only the request whose program it runs', async () => {
  const first = compiler.compileAndRun(program);
  const second = compiler.compileAndRun(irOnly);
  const [worker] = compilerWorkers;
  worker.ready();
  worker.answer(1, 'a', { executable: true });
  programWorkers[0].exit(1, 0);
  expect((await first)?.execution?.exitCode).toBe(0);
  // The finished program leaves an error behind while the next request is being compiled.
  programWorkers[0].fail('late error');
  worker.answer(2, 'b');
  const result = await second;
  expect(irMarker(result)).toBe('b');
  expect(result?.compilation.error).toBeUndefined();
});
