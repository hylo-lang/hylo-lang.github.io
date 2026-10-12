/** A snippet's program is its files, those shown holding their code, hidden and shown, in order. */
import { expect, test } from 'vitest';
import { assembleProgram, lineCount, shownCodeOffset } from './snippet';

const point = { name: 'point.hylo', contents: 'struct P {}' };
const main = { file: 'main.hylo', prelude: 'a\nb', source: 'c', epilogue: 'd' };
const code = { files: [point, { name: 'main.hylo', contents: '' }], shown: [main] };

test('puts the code shown between the hidden code of its file, leaving out the parts it lacks', () => {
  expect(assembleProgram(code)).toEqual([point, { name: 'main.hylo', contents: 'a\nb\nc\nd' }]);
  const bare = { ...code, shown: [{ ...main, prelude: '', epilogue: '' }] };
  expect(assembleProgram(bare)[1].contents).toBe('c');
  expect(assembleProgram(code, [''])[1].contents).toBe('a\nb\nd');
});

test('puts the code given in place of the code shown, file by file', () => {
  const both = {
    files: [
      { name: 'a.hylo', contents: '' },
      { name: 'b.hylo', contents: '' },
    ],
    shown: [
      { ...main, file: 'b.hylo', prelude: '', epilogue: '' },
      { ...main, file: 'a.hylo', prelude: 'x', epilogue: '' },
    ],
  };
  expect(assembleProgram(both, ['B', 'A'])).toEqual([
    { name: 'a.hylo', contents: 'x\nA' },
    { name: 'b.hylo', contents: 'B' },
  ]);
});

test('says how many lines of the file shown come before the code shown', () => {
  expect(shownCodeOffset({ ...main, prelude: '' })).toBe(0);
  expect(shownCodeOffset(main)).toBe(2);
  const lines = assembleProgram(code)[1].contents.split('\n');
  expect(lines[shownCodeOffset(main)]).toBe('c');
});

test('counts lines, none in an empty text', () => {
  expect([lineCount(''), lineCount('a'), lineCount('a\nb')]).toEqual([0, 1, 2]);
});
