import type { Diagnostic } from '@hylo-lang/hylo-wasm/protocol';
import { expect, test } from 'vitest';
import { countErrors } from './diagnostics';

/** Returns a diagnostic of `level`. */
const diagnostic = (level: Diagnostic['level']): Diagnostic => ({
  level,
  message: level,
  file: '/main.hylo',
  site: { line: 1, column: 1, endLine: 1, endColumn: 2 },
  rendered: level,
  notes: [],
});

test('countErrors counts errors only', () => {
  expect(countErrors([diagnostic('error'), diagnostic('warning'), diagnostic('error')])).toBe(2);
  expect(countErrors([])).toBe(0);
});
