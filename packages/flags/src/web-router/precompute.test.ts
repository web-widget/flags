import { describe, expect, it, vi } from 'vitest';
import {
  serialize,
  deserialize,
  generatePermutations,
  getPrecomputed,
} from './precompute';
import { flag } from './index';

const mocks = vi.hoisted(() => {
  return {
    context: vi.fn(() => ({
      state: {
        _flag: {
          request: new Request('http://example.com'),
          secret: 'test-secret',
          params: {},
          usedFlags: {},
          identifiers: new Map(),
          flagCache: new Map(),
        },
      },
    })),
  };
});

vi.mock('@web-widget/context', () => ({
  context: mocks.context,
}));

describe('precompute', () => {
  it('should serialize and deserialize flag values', async () => {
    const secret = 'test-secret-123';
    const flagA = flag({ key: 'a', decide: () => true });
    const flagB = flag({ key: 'b', decide: () => false });
    const flags = [flagA, flagB];
    const values = [true, false];

    const serialized = await serialize(flags, values, secret);
    const deserialized = await deserialize(flags, serialized, secret);

    expect(deserialized).toEqual({ a: true, b: false });
  });

  it('should get precomputed flag values', async () => {
    const secret = 'test-secret-456';
    const flagA = flag({ key: 'a', decide: () => true });
    const flagB = flag({ key: 'b', decide: () => false });
    const flags = [flagA, flagB];
    const values = [true, false];

    const serialized = await serialize(flags, values, secret);
    const valueA = await getPrecomputed(flagA, flags, serialized, secret);
    const valueB = await getPrecomputed(flagB, flags, serialized, secret);

    expect(valueA).toBe(true);
    expect(valueB).toBe(false);
  });

  it('should generate permutations for boolean flags', async () => {
    const secret = 'test-secret-789';
    const flagA = flag({ key: 'a', decide: () => false });
    const flags = [flagA];

    const permutations = await generatePermutations(flags, null, secret);
    expect(permutations).toHaveLength(2);

    const deserialized = await Promise.all(
      permutations.map((p) => deserialize(flags, p, secret)),
    );
    expect(deserialized).toEqual([{ a: false }, { a: true }]);
  });
});
