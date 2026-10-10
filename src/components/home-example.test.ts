/**
 * The program on the home page compiles and runs, and what the page shows of it is in it.
 */
import { load } from '@hylo-lang/hylo-wasm';
import { expect, test } from 'vitest';
import { excerpt, program } from './home-example';

test('the program compiles and runs to completion', async () => {
  const hylo = await load();
  const r = hylo.compile({ source: program });
  expect(r.diagnostics.map((d) => d.rendered)).toEqual([]);
  // The program checks its own result: a trap would mean the subscript does not project `y`.
  expect(await hylo.run(r.executable!)).toMatchObject({ exitCode: 0 });
}, 120_000);

test('every line the page shows is in the program', () => {
  const lines = new Set(program.split('\n').map((l) => l.trim()));
  for (const line of excerpt.split('\n')) {
    expect(lines, line).toContain(line.replace(/\s*\/\/.*$/, '').trim());
  }
});
