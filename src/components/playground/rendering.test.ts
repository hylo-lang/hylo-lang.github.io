import { expect, test } from 'vitest';
import { describeFailure, filterIRFunctions } from './rendering';

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
