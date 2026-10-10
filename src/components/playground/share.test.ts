import { describe, expect, test } from 'vitest';
import { decode, encode, type PlaygroundState } from './share';

const state: PlaygroundState = {
  source: 'public fun main() -> Int32 {\n  // ünïcödé, emoji 🦎, and a long line\n  42\n}\n',
  optimization: 2,
  view: 'llvm',
};

/** Returns the payload of version 1 holding `json`. */
async function v1(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const s = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
  return `v=1&s=${s.replace(/=+$/, '')}`;
}

describe('a shared state', () => {
  test('survives encoding, with or without the `#`', async () => {
    const text = await encode(state);
    expect(text).toMatch(/^v=1&s=[A-Za-z0-9_-]+$/);
    expect(await decode(text)).toEqual({ state });
    expect(await decode(`#${text}`)).toEqual({ state });
  });

  test('is absent from a fragment without one', async () => {
    expect(await decode('')).toBeNull();
    expect(await decode('#section')).toBeNull();
  });

  test('of version 1 may leave out the optimization level and the view', async () => {
    expect(await decode(await v1('{"source":"x","extra":true}'))).toEqual({
      state: { source: 'x', optimization: 0, view: 'result' },
    });
  });

  test('of an unknown version is a problem, not a crash', async () => {
    expect(await decode('v=99&s=abc')).toHaveProperty('problem');
  });

  test.each([
    ['not base64url', 'v=1&s=%%%'],
    ['not deflated', 'v=1&s=aGVsbG8'],
  ])('that is %s is a problem', async (_, text) => {
    expect(await decode(text)).toHaveProperty('problem');
  });

  test.each([
    ['without source', '{"optimization":1}'],
    ['with a bad optimization level', '{"source":"x","optimization":7}'],
    ['with an unknown view', '{"source":"x","view":"nope"}'],
    ['that is not an object', '"x"'],
  ])('%s is a problem', async (_, json) => {
    expect(await decode(await v1(json))).toHaveProperty('problem');
  });
});
