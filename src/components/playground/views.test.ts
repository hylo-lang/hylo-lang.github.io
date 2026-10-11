import { expect, test } from 'vitest';
import { PHASES } from './settings';
import { canProduce, VIEWS } from './views';

test('a complete compilation can produce every view', () => {
  for (const view of VIEWS) expect(canProduce(view, null), view).toBe(true);
});

test('lowering produces Hylo IR, but no LLVM IR or WebAssembly', () => {
  expect(VIEWS.filter((view) => canProduce(view, 'lowering'))).toEqual([
    'result',
    'diagnostics',
    'raw-ir',
    'ir',
  ]);
});

test('the phases before lowering produce only the result and the diagnostics', () => {
  for (const phase of PHASES.filter((phase) => phase !== 'lowering')) {
    expect(VIEWS.filter((view) => canProduce(view, phase)), phase).toEqual([
      'result',
      'diagnostics',
    ]);
  }
});
