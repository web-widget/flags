import { expect, it, describe, vi, beforeAll } from 'vitest';
import {
  flag,
  precompute,
  dedupe,
  clearDedupeCacheForCurrentRequest,
  getProviderData,
} from '.';
import { encryptOverrides } from '..';

const mocks = vi.hoisted(() => {
  return {
    context: vi.fn(() => ({
      state: {
        _flag: {
          request: new Request('http://localhost/'),
          secret: 'test-secret',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    })),
    tryGetSecret: vi.fn(() => Promise.resolve('test-secret')),
  };
});

vi.mock('@web-widget/helpers/context', async () => {
  return {
    context: mocks.context,
  };
});

vi.mock('./env', async () => {
  return {
    tryGetSecret: mocks.tryGetSecret,
  };
});

function createRequest(cookies = {}) {
  const headers = new Headers();
  const cookieStrings = Object.entries(cookies).map(
    ([key, value]) => `${key}=${value}`,
  );
  if (cookieStrings.length > 0) {
    headers.set('cookie', cookieStrings.join('; '));
  }
  return new Request('http://localhost/', { headers });
}

describe('exports', () => {
  it('should export flag', () => {
    expect(typeof flag).toBe('function');
  });
  it('should export precompute', () => {
    expect(typeof precompute).toBe('function');
  });
  it('should export dedupe', () => {
    expect(typeof dedupe).toBe('function');
  });
  it('should export clearDedupeCacheForCurrentRequest', () => {
    expect(typeof clearDedupeCacheForCurrentRequest).toBe('function');
  });
});

describe('flag', () => {
  beforeAll(() => {
    process.env.FLAGS_SECRET = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  });

  it('allows declaring a flag', async () => {
    const request = createRequest();
    mocks.context.mockReturnValueOnce({
      state: {
        _flag: {
          request,
          secret: 'test-secret',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    });

    const f = flag({
      key: 'first-flag',
      decide: () => false,
    });

    expect(f).toHaveProperty('key', 'first-flag');
    await expect(f()).resolves.toEqual(false);
  });

  it('caches for the duration of a request', async () => {
    let i = 0;
    const decide = vi.fn(() => i++);
    const f = flag({ key: 'first-flag', decide });

    // first request using the flag twice
    const requestOfFirstRequest = createRequest();
    const contextOfFirstRequest = {
      state: {
        _flag: {
          request: requestOfFirstRequest,
          secret: 'test-secret',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    };
    mocks.context.mockReturnValueOnce(contextOfFirstRequest);
    await expect(f()).resolves.toEqual(0);

    // decide not called here so the cached 0 is returned instead of 1
    mocks.context.mockReturnValueOnce(contextOfFirstRequest);
    await expect(f()).resolves.toEqual(0);

    expect(decide).toHaveBeenCalledTimes(1);

    // next request using the flag again, gets new value
    mocks.context.mockReturnValueOnce({
      state: {
        _flag: {
          request: createRequest(),
          secret: 'test-secret',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    });
    await expect(f()).resolves.toEqual(1);

    // check the value of the first request again, which should still be 0
    mocks.context.mockReturnValueOnce(contextOfFirstRequest);
    await expect(f()).resolves.toEqual(0);

    expect(decide).toHaveBeenCalledTimes(2);
  });

  it('respects overrides', async () => {
    const decide = vi.fn(() => false);
    const f = flag({ key: 'first-flag', decide });

    const override = await encryptOverrides({ 'first-flag': true });
    const request = createRequest({ 'vercel-flag-overrides': override });

    mocks.context.mockReturnValueOnce({
      state: {
        _flag: {
          request,
          secret: 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    });

    await expect(f()).resolves.toEqual(true);
    expect(decide).not.toHaveBeenCalled();
  });

  it('uses precomputed values', async () => {
    const decide = vi.fn(() => true);
    const f = flag({
      key: 'first-flag',
      decide,
      options: [false, true],
    });
    const flagGroup = [f];

    // Set up context for precompute with matching secret
    const request = createRequest();
    mocks.context.mockReturnValueOnce({
      state: {
        _flag: {
          request,
          secret: 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    });

    const code = await precompute(flagGroup);
    expect(decide).toHaveBeenCalledTimes(1);
    await expect(f(code, flagGroup)).resolves.toEqual(true);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaultValue if an async decide throws', async () => {
    const mockDecide = vi.fn(() => Promise.reject(new Error('custom error')));

    const f = flag({
      key: 'first-flag',
      decide: mockDecide,
      defaultValue: false,
    });

    const request = createRequest();
    mocks.context.mockReturnValueOnce({
      state: {
        _flag: {
          request,
          secret: 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    });

    await expect(f()).resolves.toEqual(false);
  });

  it('falls back to the defaultValue if a sync decide throws', async () => {
    const mockDecide = vi.fn(() => {
      throw new Error('custom error');
    });

    const f = flag({
      key: 'first-flag',
      decide: mockDecide,
      defaultValue: false,
    });

    const request = createRequest();
    mocks.context.mockReturnValueOnce({
      state: {
        _flag: {
          request,
          secret: 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc',
          usedFlags: {},
          identifiers: new Map(),
        },
      },
    });

    await expect(f()).resolves.toEqual(false);
  });

  it('can be called with a request parameter when no context is available', async () => {
    const decide = vi.fn(() => true);
    const f = flag({ key: 'first-flag', decide });

    // Mock context to return undefined
    mocks.context.mockReturnValueOnce({
      state: {},
    } as any);

    const request = createRequest();
    await expect(f(request)).resolves.toEqual(true);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('supports run method with custom identify', async () => {
    const decide = vi.fn(({ entities }) => entities?.userId === 'test-user');

    const f = flag({
      key: 'first-flag',
      decide,
    });

    const request = createRequest();
    await expect(
      f.run({ identify: { userId: 'test-user' }, request }),
    ).resolves.toEqual(true);
  });

  it('should handle when there is no flag context', async () => {
    const f = flag({
      key: 'first-flag',
      decide: () => true,
      defaultValue: false,
    });

    mocks.context.mockReturnValueOnce({
      state: {},
    } as any);

    await expect(f()).rejects.toThrow(
      'flags: Neither context found nor Request provided',
    );
  });
});

describe('getProviderData', () => {
  it('returns proper structure', () => {
    const f1 = flag({ key: 'flag1', decide: () => true });
    const f2 = flag({ key: 'flag2', decide: () => 'test' });

    const result = getProviderData({ f1, f2 });

    expect(result).toHaveProperty('definitions');
    expect(result).toHaveProperty('hints');
    expect(result.definitions?.flag1).toBeDefined();
    expect(result.definitions?.flag2).toBeDefined();
  });
});
