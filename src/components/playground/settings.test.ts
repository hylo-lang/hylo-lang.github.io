import { expect, test } from 'vitest';
import { DEFAULT_TIME_LIMIT, MAX_TIME_LIMIT, MIN_TIME_LIMIT, parseTimeLimit } from './settings';

test('parseTimeLimit reads a time limit, and the default from anything else', () => {
  expect(parseTimeLimit('5')).toBe(5);
  expect(parseTimeLimit('60')).toBe(60);
  expect(parseTimeLimit('7')).toBe(7);
  expect(parseTimeLimit(' 20 ')).toBe(20);
  for (const text of [null, '', ' ', 'twenty', 'NaN', 'Infinity']) {
    expect(parseTimeLimit(text), String(text)).toBe(DEFAULT_TIME_LIMIT);
  }
});

test('parseTimeLimit rounds a time limit, and brings it within the bounds', () => {
  expect(parseTimeLimit('2.4')).toBe(2);
  expect(parseTimeLimit('2.6')).toBe(3);
  expect(parseTimeLimit('0')).toBe(MIN_TIME_LIMIT);
  expect(parseTimeLimit('-5')).toBe(MIN_TIME_LIMIT);
  expect(parseTimeLimit('1e3')).toBe(MAX_TIME_LIMIT);
});
