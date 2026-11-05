/**
 * Every example does what it says, at every optimization level, with the compiler the site is built
 * with.
 */
import { type Compiler, load } from '@hylo-lang/hylo-wasm';
import { beforeAll, describe, expect, test } from 'vitest';
import { EXAMPLES, exampleCode } from './examples';
import { compileRequest, DEFAULT_SETTINGS, OPTIMIZATION_LEVELS, type OptimizationLevel } from './settings';

/**
 * The optimization levels at which an example fails because of a bug in the compiler, by the name
 * of the example.
 *
 * These are run as tests expected to fail: once the compiler is fixed, they fail as a reminder to
 * remove the entry.
 */
const KNOWN_FAILURES: Readonly<Record<string, readonly OptimizationLevel[]>> = {
  // Calls through witness tables trap when optimized.
  'Method bundles': [2, 3],
};

test('the examples have different names', () => {
  expect(new Set(EXAMPLES.map((e) => e.name)).size).toBe(EXAMPLES.length);
});

test('every known failure names an example', () => {
  for (const name of Object.keys(KNOWN_FAILURES)) {
    expect(EXAMPLES.map((e) => e.name)).toContain(name);
  }
});

describe('examples, with the compiler', () => {
  let compiler: Compiler;
  beforeAll(async () => {
    compiler = await load();
  }, 120_000);

  const cases = EXAMPLES.flatMap((example) =>
    OPTIMIZATION_LEVELS.map((optimization) => ({ example, optimization })),
  );

  for (const { example, optimization } of cases) {
    const fails = KNOWN_FAILURES[example.name]?.includes(optimization) ?? false;
    (fails ? test.fails : test)(`${example.name} at -O${optimization}`, async () => {
      const response = compiler.compile(
        compileRequest(exampleCode(example), [], { ...DEFAULT_SETTINGS, optimization }),
      );
      expect(response.error).toBeUndefined();
      const errors = (response.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.level === 'error')
        .map((diagnostic) => diagnostic.rendered);
      if (example.expect.kind === 'error') {
        expect(errors, 'expected the example not to compile').not.toEqual([]);
        return;
      }
      expect(errors).toEqual([]);

      const run = await compiler.run(response.executable!);
      switch (example.expect.kind) {
        case 'ok':
          expect(run.trap).toBeUndefined();
          break;
        case 'exit':
          expect(run.trap).toBeUndefined();
          expect(run.exitCode).toBe(example.expect.status);
          break;
        case 'trap':
          expect(run.trap, 'expected the program to trap').toBeDefined();
          break;
      }
    });
  }
});
