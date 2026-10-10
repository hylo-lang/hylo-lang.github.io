import { expect, test } from 'vitest';
import { focusIR } from './outputs';

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

test('focusIR keeps every function when asked for none', () => {
  expect(focusIR(ir, [])).toBe(ir);
});

test('focusIR keeps the functions named, with or without their labels', () => {
  expect(focusIR(ir, ['main'])).toBe(ir.split('\n\n')[0]);
  expect(focusIR(ir, ['factorial'])).toBe(ir.split('\n\n')[1]);
  expect(focusIR(ir, ['main', 'Int32.infix+'])).toBe([ir.split('\n\n')[0], ir.split('\n\n')[2]].join('\n\n'));
});

test('focusIR keeps everything rather than nothing when no function matches', () => {
  expect(focusIR(ir, ['absent'])).toBe(ir);
});
