import { describe, expect, it, Mock, vitest, vi } from 'vitest';
import { clearDedupeCacheForCurrentRequest, dedupe } from './dedupe';

const mocks = vi.hoisted(() => {
  return {
    context: vi.fn(() => ({
      state: {
        _flag: {
          request: new Request('http://localhost/'),
        },
      },
    })),
  };
});

vi.mock('@web-widget/context', async () => {
  return {
    context: mocks.context,
  };
});

async function getContextMock() {
  return mocks.context as Mock;
}

describe('dedupe', () => {
  describe('no arguments', () => {
    it('should dedupe within same request', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped();
      await deduped();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe across requests', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const differentRequest = new Request('http://localhost/different');
      const contextMock = await getContextMock();

      contextMock.mockReturnValueOnce({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });
      await deduped();

      contextMock.mockReturnValueOnce({
        state: {
          _flag: {
            request: differentRequest,
          },
        },
      });
      await deduped();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('multiple arguments', () => {
    it('should dedupe within same request', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped(1, 'a');
      await deduped(1, 'a');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe across requests', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const differentRequest = new Request('http://localhost/different');
      const contextMock = await getContextMock();

      contextMock.mockReturnValueOnce({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });
      await deduped(1, 'a');

      contextMock.mockReturnValueOnce({
        state: {
          _flag: {
            request: differentRequest,
          },
        },
      });
      await deduped(1, 'b');

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('primitive arguments', () => {
    it('should dedupe within same request when called with the same primitive arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped(1);
      await deduped(1);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe within same request when called with different primitive arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped(1);
      await deduped(2);

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('object arguments', () => {
    it('should dedupe within same request when called with the same object references', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      const obj1 = { a: 1 };

      await deduped(obj1);
      await deduped(obj1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe within same request when called with different object references', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped({ a: 1 });
      await deduped({ a: 1 });
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('mutated object arguments', () => {
    it('should dedupe within same request when called with the same complex arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      const obj1 = { a: 1 };

      // This is technically bad, but we check for referential equality only, we do not deep equal
      // for performance reasons.
      await deduped(obj1);
      obj1.a = 2;
      await deduped(obj1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('function arguments', () => {
    it('should dedupe within same request when called with the same fn arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const someFn = () => 1;
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped(someFn);
      await deduped(someFn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe within same request when called with different fn arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const someFn = () => 1;
      const someOtherFn = () => 2;
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped(someFn);
      await deduped(someOtherFn);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearCurrent', () => {
    it('should allow dedupe to be cleared within same request', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      await deduped();
      await deduped();
      await clearDedupeCacheForCurrentRequest(deduped);
      await deduped();
      await deduped();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not affect the cache of a different request', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const otherRequest = new Request('http://localhost/other');
      const contextMock = await getContextMock();

      // fill both caches and call once each, interleaved
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });
      await deduped();

      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: otherRequest,
          },
        },
      });
      await deduped();

      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });
      await deduped();

      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: otherRequest,
          },
        },
      });
      await deduped();

      // check the fn was only called twice (once for each request)
      expect(fn).toHaveBeenCalledTimes(2);

      // now clear one cache but not the other, and call once for each request
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });
      await clearDedupeCacheForCurrentRequest(deduped);
      await deduped();

      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: otherRequest,
          },
        },
      });
      await deduped();

      // it should go from 2 → 3 as the one request gets a cache hit, but
      // the other request gets a cache miss
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('promises', () => {
    it('should dedupe even when the promise has not resolved yet', async () => {
      let resolvePromise: (value: unknown) => void = () => {
        throw new Error('resolvePromise not implemented');
      };

      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const fn = vitest.fn(() => promise);
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      const result1Promise = deduped();
      const result2Promise = deduped();
      resolvePromise(1);
      await expect(deduped()).resolves.toBe(1);

      await expect(result1Promise).resolves.toBe(1);
      await expect(result2Promise).resolves.toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should dedupe even when the promise has not rejected yet', async () => {
      let rejectPromise: (value: unknown) => void = () => {
        throw new Error('rejectPromise not implemented');
      };

      const contextMock = await getContextMock();

      const promise = new Promise((resolve, reject) => {
        rejectPromise = reject;
      });

      const fn = vitest.fn(() => promise);
      const deduped = dedupe(fn);
      const sameRequest = new Request('http://localhost/');
      contextMock.mockReturnValue({
        state: {
          _flag: {
            request: sameRequest,
          },
        },
      });

      const result1Promise = expect(deduped()).rejects.toBe('artificial error');
      const result2Promise = expect(deduped()).rejects.toBe('artificial error');

      rejectPromise('artificial error');

      // prevent unhandled promise rejection
      await promise.catch(() => {});

      await expect(deduped()).rejects.toBe('artificial error');

      await Promise.allSettled([result1Promise, result2Promise]);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw error when no request context found', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: null,
        },
      });

      await expect(deduped()).rejects.toThrow(
        'dedupe: No request context found. Make sure dedupe is called within a web-router request handler.',
      );
    });

    it('should throw error when clearing cache for non-function', async () => {
      expect(() => {
        clearDedupeCacheForCurrentRequest('not a function' as any);
      }).toThrow('dedupe: not a function');
    });

    it('should throw error when clearing cache for non-deduped function', async () => {
      const regularFn = () => {};
      expect(() => {
        clearDedupeCacheForCurrentRequest(regularFn);
      }).toThrow('dedupe: cache not found');
    });

    it('should throw error when clearing cache without request context', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const contextMock = await getContextMock();
      contextMock.mockReturnValue({
        state: {
          _flag: null,
        },
      });

      expect(() => {
        clearDedupeCacheForCurrentRequest(deduped);
      }).toThrow(
        'clearDedupeCacheForCurrentRequest: No request context found. Make sure this is called within a web-router request handler.',
      );
    });
  });
});
