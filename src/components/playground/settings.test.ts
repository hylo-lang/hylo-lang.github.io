import { expect, test } from 'vitest';
import { DEFAULT_TIME_LIMIT, parseTimeLimit } from './settings';

test('parseTimeLimit reads a time limit, and the default from anything else', () => {
  expect(parseTimeLimit('5')).toBe(5);
  expect(parseTimeLimit('60')).toBe(60);
  for (const text of [null, '', '7', '1e3', ' 20']) {
    expect(parseTimeLimit(text), String(text)).toBe(DEFAULT_TIME_LIMIT);
  }
});
