import { expect, test } from 'vitest';
import { describeFailure, filterIRFunctions, splitLocations } from './rendering';

// Function headers as the compiler prints them.
const ir = `fun main(set %p0: Int32) {
b0:
  return
}

fun factorial(_:)(sink %p0: Int32, set %p1: Int32) {
b0:
  return
}

fun Int32.infix+(_:)(let %p0: Int32, let %p1: Int32, set %p2: Int32) {
b0:
  return
}`;

test('filterIRFunctions keeps every function when asked for none', () => {
  expect(filterIRFunctions(ir, [])).toBe(ir);
});

test('filterIRFunctions keeps the functions named, with or without their labels', () => {
  expect(filterIRFunctions(ir, ['main'])).toBe(ir.split('\n\n')[0]);
  expect(filterIRFunctions(ir, ['factorial'])).toBe(ir.split('\n\n')[1]);
  expect(filterIRFunctions(ir, ['main', 'Int32.infix+'])).toBe([ir.split('\n\n')[0], ir.split('\n\n')[2]].join('\n\n'));
});

test('filterIRFunctions keeps everything rather than nothing when no function matches', () => {
  expect(filterIRFunctions(ir, ['absent'])).toBe(ir);
});

test('describeFailure says which stage did not finish within the time limit', () => {
  const compilation = { diagnostics: [], artifacts: {}, milliseconds: 0 };
  const stopped = (run: 'failed' | 'skipped', frontEnd: 'done' | 'failed') => ({
    compilation,
    execution: null,
    stages: { 'front-end': frontEnd, 'back-end': run === 'failed' ? 'done' : 'skipped', run },
  } as const);
  expect(describeFailure({ ...stopped('failed', 'done'), timedOut: 20 })).toBe(
    'The program did not finish within 20 seconds.',
  );
  expect(describeFailure({ ...stopped('skipped', 'failed'), timedOut: 1 })).toBe(
    'Compilation did not finish within 1 second.',
  );
});

test('splitLocations finds the locations a rendered diagnostic names, keeping all its text', () => {
  const rendered =
    "hylo:///main.hylo:4.11-15: error: undefined symbol 'nope'\n  let y = nope\n          ~~~~\n" +
    'hylo:///lib/point.hylo:2.3-5.1: note: declared here';
  const parts = splitLocations(rendered);
  expect(parts.map((p) => (typeof p === 'string' ? p : p.text)).join('')).toBe(rendered);
  expect(parts.filter((p) => typeof p !== 'string')).toEqual([
    {
      text: 'hylo:///main.hylo:4.11-15',
      location: { file: '/main.hylo', site: { line: 4, column: 11, endLine: 4, endColumn: 15 } },
    },
    {
      text: 'hylo:///lib/point.hylo:2.3-5.1',
      location: { file: '/lib/point.hylo', site: { line: 2, column: 3, endLine: 5, endColumn: 1 } },
    },
  ]);
});

test('splitLocations leaves text naming no location whole', () => {
  expect(splitLocations('error: something went wrong')).toEqual(['error: something went wrong']);
});
