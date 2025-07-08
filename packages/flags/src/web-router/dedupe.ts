import { context } from '@web-widget/context';

enum Status {
  UNTERMINATED = 0,
  TERMINATED = 1,
  ERRORED = 2,
}

type RequestStore<T> = WeakMap<Request, CacheNode<T>>;

type CacheNode<T> = {
  s: Status;
  v: T | undefined | unknown;
  o: WeakMap<Function | Object, CacheNode<T>> | null;
  p: Map<
    string | number | null | undefined | symbol | boolean,
    CacheNode<T>
  > | null;
};

function createCacheNode<T>(): CacheNode<T> {
  return {
    s: Status.UNTERMINATED,
    v: undefined,
    o: null,
    p: null,
  };
}

/**
 * We use a registry to store the request store for each deduped function.
 *
 * This is necessary as we don't want to attach the request store to the deduped
 * to retain its original type, and we need to be able to clear the cache for the
 * current request.
 */
const cacheRegistry = new WeakMap<Function, RequestStore<unknown>>();

/**
 * A web-router-friendly version of React.cache.
 *
 * Given the same arguments, the function wrapped by this function will only ever run once for the duration of a request.
 *
 * This function ensures that expensive operations like database queries or API calls
 * are not duplicated within the same request context.
 *
 * @param fn - The function to deduplicate
 * @returns A deduped version of the function
 */
export function dedupe<A extends Array<unknown>, T>(
  fn: (...args: A) => T | Promise<T>,
): (...args: A) => Promise<T> {
  const requestStore: RequestStore<T> = new WeakMap<Request, CacheNode<T>>();

  const dedupedFn = async function (this: unknown, ...args: A): Promise<T> {
    // Get the current request from web-router context
    const store = context().state._flag;
    if (!store?.request) {
      throw new Error(
        'dedupe: No request context found. Make sure dedupe is called within a web-router request handler.',
      );
    }

    const request = store.request;
    let cacheNode = requestStore.get(request);
    if (!cacheNode) {
      cacheNode = createCacheNode<T>();
      requestStore.set(request, cacheNode);
    }

    // Build argument tree for cache lookup
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (
        typeof arg === 'function' ||
        (typeof arg === 'object' && arg !== null)
      ) {
        let objectCache: WeakMap<Function | Object, CacheNode<T>> | null =
          cacheNode.o;
        if (objectCache === null) {
          cacheNode.o = objectCache = new WeakMap();
        }
        const objectNode = objectCache.get(arg);
        if (objectNode === undefined) {
          cacheNode = createCacheNode();
          objectCache.set(arg, cacheNode);
        } else {
          cacheNode = objectNode;
        }
      } else {
        let primitiveCache: Map<unknown, CacheNode<T>> | null = cacheNode.p;
        if (primitiveCache === null) {
          cacheNode.p = primitiveCache = new Map();
        }
        const primitiveNode = primitiveCache.get(arg);
        if (primitiveNode === undefined) {
          cacheNode = createCacheNode();
          primitiveCache.set(arg, cacheNode);
        } else {
          cacheNode = primitiveNode;
        }
      }
    }

    // Check if we have a cached result
    if (cacheNode.s === Status.TERMINATED) {
      return cacheNode.v as T;
    }
    if (cacheNode.s === Status.ERRORED) {
      throw cacheNode.v;
    }

    // Execute the function and cache the result
    try {
      const result = fn.apply(this, args);
      cacheNode.s = Status.TERMINATED;
      cacheNode.v = result;
      return result;
    } catch (error) {
      cacheNode.s = Status.ERRORED;
      cacheNode.v = error;
      throw error;
    }
  };

  cacheRegistry.set(dedupedFn, requestStore);
  return dedupedFn;
}

/**
 * Clears the cached value of a deduped function for the current request.
 *
 * This function is useful for resetting the cache after making changes to
 * the underlying cached information.
 *
 * @param dedupedFn - The deduped function to clear cache for
 */
export function clearDedupeCacheForCurrentRequest(
  dedupedFn: (...args: unknown[]) => unknown,
) {
  if (typeof dedupedFn !== 'function') {
    throw new Error('dedupe: not a function');
  }
  const requestStore = cacheRegistry.get(dedupedFn);

  if (!requestStore) {
    throw new Error('dedupe: cache not found');
  }

  const store = context().state._flag;
  if (!store?.request) {
    throw new Error(
      'clearDedupeCacheForCurrentRequest: No request context found. Make sure this is called within a web-router request handler.',
    );
  }

  return requestStore.delete(store.request);
}
