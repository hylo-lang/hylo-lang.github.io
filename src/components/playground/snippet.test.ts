/** A snippet's program is its code, hidden and shown, in order. */
import { expect, test } from 'vitest';
import { assembleProgram, shownCodeOffset } from './snippet';

test('puts the parts of a snippet one line after another, leaving out those it lacks', () => {
  expect(assembleProgram({ prelude: 'a\nb', source: 'c', epilogue: 'd' })).toBe('a\nb\nc\nd');
  expect(assembleProgram({ prelude: '', source: 'c', epilogue: '' })).toBe('c');
  expect(assembleProgram({ prelude: 'a', source: '', epilogue: 'd' })).toBe('a\nd');
});

test('says how many lines of the program come before the code shown', () => {
  expect(shownCodeOffset({ prelude: '', source: 'c', epilogue: 'd' })).toBe(0);
  expect(shownCodeOffset({ prelude: 'a\nb', source: 'c', epilogue: '' })).toBe(2);
  const code = { prelude: 'a\nb', source: 'c\nd', epilogue: 'e' };
  expect(assembleProgram(code).split('\n')[shownCodeOffset(code)]).toBe('c');
});
