/**
 * The grammars of what the compiler prints, `hylo-ir` and `wasm-asm`, checked through the
 * highlighter the site uses (see `src/components/playground/highlight.ts`).
 *
 * Every word of the IR and assembly the playground's compiler prints for the examples must get a
 * scope of its own, so that a construct the compiler learns and the grammars do not shows up here
 * rather than as uncoloured text on a page. A few lines are also checked token by token, for the
 * scopes that are easy to get subtly wrong.
 */
import { type Compiler, load } from '@hylo-lang/hylo-wasm';
import { beforeAll, describe, expect, test } from 'vitest';
import { EXAMPLES } from '../../components/playground/examples';
import { getHighlighter, THEMES } from '../../components/playground/highlight';

type Language = 'hylo-ir' | 'wasm-asm';

/** A token of highlighted text, with the innermost scope it was given. */
interface Token {
  line: number;
  text: string;
  scope: string;
}

/** Returns the tokens of `text` highlighted as `lang`. */
async function tokens(text: string, lang: Language): Promise<Token[]> {
  const h = await getHighlighter();
  return h
    .codeToTokens(text, { lang, theme: THEMES.dark, includeExplanation: true })
    .tokens.flatMap((line, i) =>
      line.flatMap((t) =>
        (t.explanation ?? []).map((e) => ({
          line: i + 1,
          text: e.content,
          scope: e.scopes.at(-1)!.scopeName,
        })),
      ),
    );
}

/** Returns the words of `text` that `lang` leaves without a scope of their own. */
async function unscoped(text: string, lang: Language): Promise<string[]> {
  return (await tokens(text, lang))
    .filter((t) => /[A-Za-z0-9]/.test(t.text) && t.scope === `source.${lang}`)
    .map((t) => `${t.line}: ${JSON.stringify(t.text)}`);
}

/** Expects `text` to scope each of `expected`'s words as given, in order. */
async function check(text: string, expected: [string, string][], lang: Language = 'hylo-ir') {
  const got = (await tokens(text, lang))
    .filter((t) => t.text.trim() !== '')
    .map((t) => [t.text.trim(), t.scope.replace(/\.(hylo-ir|wasm-asm)$/, '')]);
  for (const [word, scope] of expected) {
    const i = got.findIndex(([w]) => w === word);
    expect(i, `${JSON.stringify(word)} in ${JSON.stringify(text)}`).toBeGreaterThanOrEqual(0);
    expect(got[i][1], `the scope of ${JSON.stringify(word)} in ${JSON.stringify(text)}`).toBe(scope);
    got.splice(0, i + 1);
  }
}

describe('Hylo IR', () => {
  test('function headers', async () => {
    await check('fun factorial(_:)(sink %p0: Int32, set %p1: Int32) {', [
      ['fun', 'keyword.other.fun'],
      ['factorial', 'entity.name.function'],
      ['(_:)', 'entity.name.function.labels'],
      ['sink', 'storage.modifier.convention'],
      ['%p0', 'variable.parameter'],
      ['Int32', 'entity.name.type'],
    ]);
    await check('fun id(_:)(inout %p0: Int32) inout <: Int32 {', [
      ['inout', 'storage.modifier.convention'],
      ['inout', 'storage.modifier.convention'],
      ['<:', 'keyword.operator'],
      ['Int32', 'entity.name.type'],
    ]);
  });

  test('synthesized and derived names', async () => {
    await check('fun $implementation[P.f for Self: T].existentialized(let %p0: Type) {', [
      ['$implementation', 'support.function.synthesized'],
      ['for', 'keyword.other'],
      ['existentialized', 'support.function.derived'],
    ]);
    await check('fun Triple.$<ConformanceDeclaration at main:4.18>() let <: Deinitializable<Triple> {', [
      ['Triple', 'entity.name.type'],
      ['ConformanceDeclaration', 'support.class'],
      ['main:4.18', 'constant.other.source-site'],
      ['<:', 'keyword.operator'],
    ]);
    await check('  %r6 = apply make.existentialized(%r14) => %r17', [
      ['make', 'entity.name.function'],
      ['existentialized', 'support.function.derived'],
    ]);
  });

  test('instructions', async () => {
    await check('  %r3 = property "two" of %r2 as [Void](let P<Self>, self: let Self) let -> Int32', [
      ['self', 'variable.parameter.label'],
      ['->', 'keyword.operator'],
    ]);
    await check('%b2:', [['%b2', 'entity.name.label.block']]);
    await check('  %r20 = condbr %r18, %b3, %b2', [
      ['%r20', 'variable.other.register.definition'],
      ['condbr', 'keyword.control.terminator'],
      ['%r18', 'variable.other.register'],
      ['%b3', 'entity.name.label.block'],
    ]);
    await check('  %r2 = access [let, inout] %r1', [
      ['access', 'keyword.other.instruction'],
      ['let', 'storage.modifier.convention'],
      ['inout', 'storage.modifier.convention'],
    ]);
    await check('  %r82 = apply_builtin icmp_sgt_i32(%r79, %r81)', [
      ['apply_builtin', 'keyword.other.instruction'],
      ['icmp_sgt_i32', 'support.function.builtin'],
    ]);
    await check('  %r78 = property "value" of %r12 as i32', [
      ['"value"', 'string.quoted.double'],
      ['of', 'keyword.other'],
      ['i32', 'storage.type.machine'],
    ]);
    await check('  %r0 = alloca Int32, #preferred', [['#preferred', 'constant.language.alignment']]);
  });
});

describe('WebAssembly assembly', () => {
  test('directives, labels and instructions', async () => {
    await check('\t.functype\tmain (i32, i32) -> (i32)', [
      ['.functype', 'keyword.control.directive'],
      ['main', 'variable.other.symbol'],
      ['i32', 'storage.type'],
      ['->', 'keyword.operator'],
    ], 'wasm-asm');
    await check('main:', [['main', 'entity.name.function']], 'wasm-asm');
    await check('.LBB0_2:', [['.LBB0_2', 'entity.name.label']], 'wasm-asm');
    await check('\ti32.const\t24', [
      ['i32.const', 'keyword.other.instruction'],
      ['24', 'constant.numeric'],
    ], 'wasm-asm');
    await check('\tbr_if   \t0  # 0: down to label1', [
      ['br_if', 'keyword.other.instruction'],
      ['# 0: down to label1', 'comment.line.number-sign'],
    ], 'wasm-asm');
    await check('\t.section\t.text.main,"",@', [
      ['.section', 'keyword.control.directive'],
      ['""', 'string.quoted.double'],
    ], 'wasm-asm');
  });
});

describe(
  'what the compiler prints for the examples',
  () => {
    let compile: Compiler['compile'];

    beforeAll(async () => {
      const hylo = await load();
      compile = (request) => hylo.compile(request);
    }, 120_000);

    test('the first example produces something to check', () => {
      const { artifacts = {} } = compile({ source: EXAMPLES[0].source, emit: ['raw-ir', 'ir', 'assembly'] });
      expect(Object.keys(artifacts).sort()).toEqual(['assembly', 'ir', 'raw-ir']);
    });

    test.each(EXAMPLES.map((e) => [e.name, e.source] as const))('%s', async (_, source) => {
      for (const optimization of [0, 2]) {
        const { artifacts = {} } = compile({ source, emit: ['raw-ir', 'ir', 'assembly'], optimization });
        for (const [artifact, lang] of [['raw-ir', 'hylo-ir'], ['ir', 'hylo-ir'], ['assembly', 'wasm-asm']] as const) {
          if (artifacts[artifact] === undefined) continue;
          expect(await unscoped(artifacts[artifact], lang), `${artifact} at -O${optimization}`).toEqual([]);
        }
      }
    });
  },
);
