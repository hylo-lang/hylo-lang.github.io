/**
 * The playground's state survives being written into a link or storage, and reading anything
 * else yields a problem rather than a malformed state.
 */
import { describe, expect, test } from 'vitest';
import {
  decodeFragment,
  deserialize,
  encodeFragment,
  serialize,
  type PlaygroundState,
} from './share';

const state: PlaygroundState = {
  source: 'public fun main() -> Int32 {\n  // ünïcödé, emoji 🦎, and a long line\n  42\n}\n',
  optimization: 2,
  standardLibrary: false,
  stopAfter: 'lowering',
  view: 'llvm',
};

/** Returns the fragment holding `json`, as `encodeFragment` writes it. */
function fragment(json: string): string {
  const bytes = new TextEncoder().encode(json);
  const base64 = btoa(String.fromCharCode(...bytes));
  return `state=${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

describe('a state', () => {
  test('survives a link, with or without the `#`', () => {
    const text = encodeFragment(state);
    expect(text).toMatch(/^state=[A-Za-z0-9_-]+$/);
    expect(decodeFragment(text)).toEqual({ state });
    expect(decodeFragment(`#${text}`)).toEqual({ state });
  });

  test('survives storage', () => {
    expect(deserialize(serialize(state))).toEqual({ state });
  });

  test('is written as JSON naming its version', () => {
    expect(JSON.parse(serialize(state))).toEqual({ version: 1, ...state });
  });

  test('is absent from a fragment without one', () => {
    expect(decodeFragment('')).toBeNull();
    expect(decodeFragment('#section')).toBeNull();
  });

  test('of version 1 may leave out what has a default, and hold more', () => {
    expect(decodeFragment(fragment('{"version":1,"source":"x","extra":true}'))).toEqual({
      state: { source: 'x', optimization: 0, standardLibrary: true, stopAfter: null, view: 'result' },
    });
  });

  test('of a newer version says so', () => {
    expect(deserialize('{"version":2,"source":"x"}')).toEqual({
      problem: expect.stringContaining('newer'),
    });
  });

  test.each([
    ['not base64url', 'state=%%%'],
    ['base64 rather than base64url', 'state=a+b/'],
    ['not UTF-8', `state=${btoa('\xff\xfe').replace(/=+$/, '')}`],
    ['not JSON', fragment('{')],
  ])('that is %s is damaged', (_, text) => {
    expect(decodeFragment(text)).toEqual({ problem: expect.stringContaining('damaged') });
  });

  test.each([
    ['without a version', '{"source":"x"}'],
    ['with a version that is a name', '{"version":"constructor","source":"x"}'],
    ['with a version of no schema', '{"version":0,"source":"x"}'],
    ['with a fractional version', '{"version":1.5,"source":"x"}'],
    ['without source', '{"version":1}'],
    ['with source that is not text', '{"version":1,"source":42}'],
    ['with a bad optimization level', '{"version":1,"source":"x","optimization":7}'],
    ['with an optimization level as text', '{"version":1,"source":"x","optimization":"2"}'],
    ['with an unknown phase', '{"version":1,"source":"x","stopAfter":"linking"}'],
    ['with an unknown view', '{"version":1,"source":"x","view":"nope"}'],
    ['with a view inherited by every object', '{"version":1,"source":"x","view":"toString"}'],
    ['that is not an object', '"x"'],
    ['that is null', 'null'],
    ['that is an array', '[1]'],
  ])('%s is damaged', (_, json) => {
    expect(deserialize(json)).toEqual({ problem: expect.stringContaining('damaged') });
    expect(decodeFragment(fragment(json))).toEqual({ problem: expect.stringContaining('damaged') });
  });
});
