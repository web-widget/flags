import { describe, expect, it } from 'vitest';
import {
  deserialize,
  evaluate,
  precompute,
  generatePermutations,
  getPrecomputed,
  serialize,
} from './precompute';
import type { Flag } from '../next/types';
import crypto from 'node:crypto';
import type { JsonValue } from '../types';

// Create simple test flag objects for testing
function createTestFlag<T extends JsonValue>(
  key: string,
  decide: (request?: any) => T | Promise<T>,
  options?: T[],
): Flag<T, any> {
  const flagFn = (request?: any) => decide(request);
  flagFn.key = key;
  flagFn.options = options?.map((opt) => ({ value: opt }));
  flagFn.decide = decide;
  return flagFn as Flag<T, any>;
}

/**
 * Helper function to assert the generated permutations.
 *
 * @param group the group of flags to generate permutations for
 * @param expected the expected permutations
 */
async function expectPermutations(
  group: Flag<any, any>[],
  expected: any[],
  filter?: ((permutation: Record<string, JsonValue>) => boolean) | null,
) {
  const permutationsPromise = generatePermutations(group, filter);
  await expect(permutationsPromise).resolves.toHaveLength(expected.length);

  const permutations = await permutationsPromise;
  await expect(
    Promise.all(permutations.map((p) => deserialize(group, p))),
  ).resolves.toEqual(expected);
}

describe('generatePermutations', () => {
  describe('when flag declares no options', () => {
    it('should infer boolean options', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = createTestFlag('a', () => false);
      await expectPermutations([flagA], [{ a: false }, { a: true }]);
    });
  });

  describe('when flag declares empty options', () => {
    it('should not infer any options', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = createTestFlag('a', () => false, []);
      await expectPermutations([flagA], []);
    });
  });

  describe('when flag declares options', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = createTestFlag('a', () => 'two', ['one', 'two', 'three']);

      await expectPermutations(
        [flagA],
        [{ a: 'one' }, { a: 'two' }, { a: 'three' }],
      );
    });
  });

  describe('when flag declares options with a filter', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = createTestFlag('a', () => 'two', ['one', 'two', 'three']);

      await expectPermutations(
        [flagA],
        [{ a: 'two' }],
        // the filter passed to generatePermutations()
        (permutation) => permutation.a === 'two',
      );
    });
  });

  describe('multiple flags with inferred options', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = createTestFlag('a', () => false);

      const flagB = createTestFlag('b', () => false);

      await expectPermutations(
        [flagA, flagB],
        [
          { a: false, b: false },
          { a: true, b: false },
          { a: false, b: true },
          { a: true, b: true },
        ],
      );
    });
  });

  describe('multiple flags with a mix of inferred and declared options', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = createTestFlag('a', () => false);

      const flagB = createTestFlag('b', () => false);

      const flagC = createTestFlag('c', () => 'two', ['one', 'two', 'three']);

      await expectPermutations(
        [flagA, flagB, flagC],
        [
          { a: false, b: false, c: 'one' },
          { a: true, b: false, c: 'one' },
          { a: false, b: true, c: 'one' },
          { a: true, b: true, c: 'one' },

          { a: false, b: false, c: 'two' },
          { a: true, b: false, c: 'two' },
          { a: false, b: true, c: 'two' },
          { a: true, b: true, c: 'two' },

          { a: false, b: false, c: 'three' },
          { a: true, b: false, c: 'three' },
          { a: false, b: true, c: 'three' },
          { a: true, b: true, c: 'three' },
        ],
      );
    });
  });

  describe('multiple flags with a mix of inferred and declared options, filtered', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = createTestFlag('a', () => false);

      const flagB = createTestFlag('b', () => false);

      const flagC = createTestFlag('c', () => 'two', ['one', 'two', 'three']);

      await expectPermutations(
        [flagA, flagB, flagC],
        [
          { a: false, b: true, c: 'two' },
          { a: true, b: true, c: 'two' },
        ],
        (permutation) => permutation.c === 'two' && permutation.b,
      );
    });
  });
});

describe('getPrecomputed', () => {
  it('should return the precomputed value', async () => {
    process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

    const flagA = createTestFlag('a', () => true);
    const flagB = createTestFlag('b', () => false);

    const group = [flagA, flagB];
    const code = await serialize(group, [true, false]);
    await expect(getPrecomputed(flagA, group, code)).resolves.toBe(true);
  });
});

describe('evaluate', () => {
  it('should evaluate flags without request', async () => {
    process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

    const flagA = createTestFlag('a', () => true);
    const flagB = createTestFlag('b', () => 'test');
    const flags = [flagA, flagB];

    const result = await evaluate(flags);
    expect(result).toEqual([true, 'test']);
  });

  it('should evaluate flags with request object', async () => {
    process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

    const mockRequest = {
      cookies: { 'user-id': '123' },
    } as any;

    const flagA = createTestFlag(
      'a',
      (request) => request?.cookies?.['user-id'] === '123',
    );
    const flagB = createTestFlag('b', (request) =>
      request?.cookies?.['user-id'] ? 'authenticated' : 'anonymous',
    );
    const flags = [flagA, flagB];

    const result = await evaluate(flags, mockRequest);
    expect(result).toEqual([true, 'authenticated']);
  });

  it('should handle flags that use request context', async () => {
    process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

    const mockRequest = {
      cookies: { theme: 'dark' },
    } as any;

    const flagA = createTestFlag(
      'theme',
      (request) => request?.cookies?.['theme'] || 'light',
    );
    const flags = [flagA];

    const result = await evaluate(flags, mockRequest);
    expect(result).toEqual(['dark']);
  });
});

describe('precompute', () => {
  it('should precompute flags without request', async () => {
    process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

    const flagA = createTestFlag('a', () => true);
    const flagB = createTestFlag('b', () => 'test');
    const flags = [flagA, flagB];

    const result = await precompute(flags);
    expect(typeof result).toBe('string');

    // Verify the result can be deserialized
    const deserialized = await deserialize(flags, result);
    expect(deserialized).toEqual({ a: true, b: 'test' });
  });

  it('should precompute flags with request object', async () => {
    process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

    const mockRequest = {
      cookies: { 'user-id': '456' },
    } as any;

    const flagA = createTestFlag(
      'a',
      (request) => request?.cookies?.['user-id'] === '456',
    );
    const flagB = createTestFlag('b', (request) =>
      request?.cookies?.['user-id'] ? 'user-456' : 'unknown',
    );
    const flags = [flagA, flagB];

    const result = await precompute(flags, mockRequest);
    expect(typeof result).toBe('string');

    // Verify the result can be deserialized
    const deserialized = await deserialize(flags, result);
    expect(deserialized).toEqual({ a: true, b: 'user-456' });
  });

  it('should handle complex request scenarios', async () => {
    process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

    const mockRequest = {
      cookies: {
        'user-type': 'premium',
        region: 'us-east',
      },
    } as any;

    const flagA = createTestFlag(
      'premium-features',
      (request) => request?.cookies?.['user-type'] === 'premium',
    );
    const flagB = createTestFlag(
      'region',
      (request) => request?.cookies?.['region'] || 'default',
    );
    const flagC = createTestFlag('feature-limit', (request) => {
      const userType = request?.cookies?.['user-type'];
      return userType === 'premium' ? 100 : 10;
    });
    const flags = [flagA, flagB, flagC];

    const result = await precompute(flags, mockRequest);
    expect(typeof result).toBe('string');

    // Verify the result can be deserialized
    const deserialized = await deserialize(flags, result);
    expect(deserialized).toEqual({
      'premium-features': true,
      region: 'us-east',
      'feature-limit': 100,
    });
  });
});
