import { RequestCookies } from '@edge-runtime/cookies';
import { MiddlewareContext, MiddlewareHandler } from '@web-widget/schema';
import { context } from '@web-widget/helpers/context';
import {
  type ApiData,
  type FlagDefinitionType,
  type ProviderData,
  reportValue,
  safeJsonStringify,
  verifyAccess,
  type FlagDefinitionsType,
  encryptFlagValues as _encryptFlagValues,
  decryptFlagValues as _decryptFlagValues,
  encryptOverrides as _encryptOverrides,
  decryptOverrides as _decryptOverrides,
  encryptFlagDefinitions as _encryptFlagDefinitions,
  decryptFlagDefinitions as _decryptFlagDefinitions,
  version,
} from '..';
import type {
  Decide,
  FlagDeclaration,
  FlagOverridesType,
  FlagValuesType,
  Identify,
  JsonValue,
  Origin,
} from '../types';
import type { Flag } from './types';
import { getOverrides } from './overrides';
import { normalizeOptions } from '../lib/normalize-options';
import { getPrecomputed } from './precompute';
import {
  type ReadonlyHeaders,
  HeadersAdapter,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';
import { setSpanAttribute, trace } from '../lib/tracing';
import { internalReportValue } from '../lib/report-value';
import { createFlagScriptInjectionTransform } from './html-transform';
import { tryGetSecret } from './env';
import { serialize } from '../lib/serialization';
import { safeExecute } from './error-handling';

export type { Flag } from './types';

export {
  getPrecomputed,
  combine,
  serialize,
  deserialize,
  evaluate,
  precompute,
  generatePermutations,
} from './precompute';

export { dedupe, clearDedupeCacheForCurrentRequest } from './dedupe';

declare module '@web-widget/schema' {
  interface State {
    _flag?: FlagContext;
  }
}

function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
}

// a map of (headers, flagKey, entitiesKey) => value
const evaluationCache = new WeakMap<
  Headers,
  Map</* flagKey */ string, Map</* entitiesKey */ string, any>>
>();

type IdentifyArgs = Parameters<
  Exclude<FlagDeclaration<any, any>['identify'], undefined>
>;
const identifyArgsMap = new WeakMap<Headers, IdentifyArgs>();
const headersMap = new WeakMap<Headers, ReadonlyHeaders>();
const cookiesMap = new WeakMap<Headers, ReadonlyRequestCookies>();

function getCachedValuePromise(
  headers: Headers,
  flagKey: string,
  entitiesKey: string,
): any {
  const map = evaluationCache.get(headers)?.get(flagKey);
  if (!map) return undefined;
  return map.get(entitiesKey);
}

function setCachedValuePromise(
  headers: Headers,
  flagKey: string,
  entitiesKey: string,
  flagValue: any,
): any {
  const byHeaders = evaluationCache.get(headers);

  if (!byHeaders) {
    evaluationCache.set(
      headers,
      new Map([[flagKey, new Map([[entitiesKey, flagValue]])]]),
    );
    return;
  }

  const byFlagKey = byHeaders.get(flagKey);
  if (!byFlagKey) {
    byHeaders.set(flagKey, new Map([[entitiesKey, flagValue]]));
    return;
  }

  byFlagKey.set(entitiesKey, flagValue);
}

function sealHeaders(headers: Headers): ReadonlyHeaders {
  const cached = headersMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = HeadersAdapter.seal(
    headers,
    'Headers cannot be modified in web-router. Headers are read-only during request processing.',
  );
  headersMap.set(headers, sealed);
  return sealed;
}

function sealCookies(headers: Headers): ReadonlyRequestCookies {
  const cached = cookiesMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = RequestCookiesAdapter.seal(
    new RequestCookies(headers),
    'Cookies cannot be modified in web-router. Use Response.headers to set cookies in the response.',
  );
  cookiesMap.set(headers, sealed);
  return sealed;
}

function isIdentifyFunction<ValueType, EntitiesType>(
  identify: FlagDeclaration<ValueType, EntitiesType>['identify'] | EntitiesType,
): identify is FlagDeclaration<ValueType, EntitiesType>['identify'] {
  return typeof identify === 'function';
}

async function getEntities<ValueType, EntitiesType>(
  identify: FlagDeclaration<ValueType, EntitiesType>['identify'] | EntitiesType,
  dedupeCacheKey: Headers,
  readonlyHeaders: ReadonlyHeaders,
  readonlyCookies: ReadonlyRequestCookies,
): Promise<EntitiesType | undefined> {
  if (!identify) return undefined;
  if (!isIdentifyFunction(identify)) return identify;

  const args = identifyArgsMap.get(dedupeCacheKey);
  if (args)
    return identify(
      ...(args as [
        { headers: ReadonlyHeaders; cookies: ReadonlyRequestCookies },
      ]),
    );

  const nextArgs: IdentifyArgs = [
    { headers: readonlyHeaders, cookies: readonlyCookies },
  ];
  identifyArgsMap.set(dedupeCacheKey, nextArgs);
  return identify(
    ...(nextArgs as [
      { headers: ReadonlyHeaders; cookies: ReadonlyRequestCookies },
    ]),
  );
}

type PromisesMap<T> = {
  [K in keyof T]: Promise<T[K]>;
};

async function resolveObjectPromises<T>(obj: PromisesMap<T>): Promise<T> {
  // Convert the object into an array of [key, promise] pairs
  const entries = Object.entries(obj) as [keyof T, Promise<any>][];

  // Use Promise.all to wait for all the promises to resolve
  const resolvedEntries = await Promise.all(
    entries.map(async ([key, promise]) => {
      const value = await promise;
      return [key, value] as [keyof T, T[keyof T]];
    }),
  );

  // Convert the array of resolved [key, value] pairs back into an object
  return Object.fromEntries(resolvedEntries) as T;
}

function getDecide<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Decide<ValueType, EntitiesType> {
  return function decide(params) {
    if (typeof definition.decide === 'function') {
      return definition.decide(params);
    }
    if (typeof definition.adapter?.decide === 'function') {
      return definition.adapter.decide({ key: definition.key, ...params });
    }
    throw new Error(`flags: No decide function provided for ${definition.key}`);
  };
}

function getIdentify<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Identify<EntitiesType> {
  return function identify(params) {
    if (typeof definition.identify === 'function') {
      return definition.identify(params);
    }
    if (typeof definition.adapter?.identify === 'function') {
      return definition.adapter.identify(params);
    }
    return definition.identify;
  };
}

function getOrigin<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): string | Origin | undefined {
  if (definition.origin) return definition.origin;
  if (typeof definition.adapter?.origin === 'function')
    return definition.adapter.origin(definition.key);
  return definition.adapter?.origin;
}

/**
 * Used when a flag is called outside of a request context, i.e. outside of the lifecycle of the `handle` hook.
 * This could be the case when the flag is called from edge middleware.
 */
const requestMap = new WeakMap<Request, FlagContext>();

type Run<ValueType, EntitiesType> = (options: {
  identify: FlagDeclaration<ValueType, EntitiesType>['identify'] | EntitiesType;
  request?: Request;
}) => Promise<ValueType>;

function getRun<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
  decide: Decide<ValueType, EntitiesType>,
): Run<ValueType, EntitiesType> {
  return async function run(options): Promise<ValueType> {
    let store = context().state._flag;

    // If no store, create one from the provided request
    if (!store) {
      if (options.request) {
        const cached = requestMap.get(options.request);
        if (!cached) {
          store = createContext(options.request, await tryGetSecret());
          requestMap.set(options.request, store);
        } else {
          store = cached;
        }
      } else {
        throw new Error('flags: Neither context found nor Request provided');
      }
    }

    const headers = sealHeaders(store.request.headers);
    const cookies = sealCookies(store.request.headers);

    // Use improved overrides function with memoization
    const overridesCookie = cookies.get('vercel-flag-overrides')?.value;
    const overrides = await getOverrides(overridesCookie);

    let entities: EntitiesType | undefined;

    // Use provided identify
    if (options.identify) {
      if (typeof options.identify === 'function') {
        entities = await (options.identify as Identify<EntitiesType>)({
          headers,
          cookies,
        });
      } else {
        entities = options.identify as EntitiesType;
      }
    }

    // Create entities key for caching
    const entitiesKey = JSON.stringify(entities) ?? '';

    // Check sophisticated cache first
    const cachedValue = getCachedValuePromise(
      store.request.headers,
      definition.key,
      entitiesKey,
    );
    if (cachedValue !== undefined) {
      return await cachedValue;
    }

    if (overrides && hasOwnProperty(overrides, definition.key)) {
      const value = overrides[definition.key];
      if (typeof value !== 'undefined') {
        setSpanAttribute('method', 'override');
        const resolvedPromise = Promise.resolve(value as JsonValue);

        // Update cache
        setCachedValuePromise(
          store.request.headers,
          definition.key,
          entitiesKey,
          resolvedPromise,
        );

        internalReportValue(definition.key, value, {
          reason: 'override',
        });
        return value;
      }
    }

    // Execute decide function with improved error handling
    const valuePromise = safeExecute(
      () =>
        decide({
          headers,
          cookies,
          entities,
        }),
      definition.defaultValue,
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.info(
            `flags: Flag "${definition.key}" is falling back to its defaultValue`,
          );
        } else {
          console.warn(
            `flags: Flag "${definition.key}" is falling back to its defaultValue after catching the following error`,
            error,
          );
        }
      },
    ).then<ValueType, ValueType>((value) => {
      if (value !== undefined) return value;
      if (definition.defaultValue !== undefined) return definition.defaultValue;
      throw new Error(
        `flags: Flag "${definition.key}" must have a defaultValue or a decide function that returns a value`,
      );
    });

    // Update cache
    setCachedValuePromise(
      store.request.headers,
      definition.key,
      entitiesKey,
      valuePromise as Promise<JsonValue>,
    );

    const value = await valuePromise;
    if (definition.config?.reportValue !== false) {
      reportValue(definition.key, value);
    }
    return value;
  };
}

/**
 * Declares a feature flag
 */
export function flag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Flag<ValueType, EntitiesType> {
  const decide = getDecide<ValueType, EntitiesType>(definition);
  const identify = getIdentify(definition);
  const run = getRun<ValueType, EntitiesType>(definition, decide);
  const origin = getOrigin(definition);

  const flagImpl = trace(
    async function flagImpl(...args: any[]): Promise<ValueType> {
      // Default method, may be overwritten by other branches
      setSpanAttribute('method', 'decided');

      // Handle precomputed flags first (similar to Next.js)
      if (typeof args[0] === 'string' && Array.isArray(args[1])) {
        setSpanAttribute('method', 'precomputed');
        const [precomputedCode, precomputedGroup, secret] = args;
        // If no secret provided, try to get from context
        const effectiveSecret =
          secret ?? context().state._flag?.secret ?? (await tryGetSecret());
        // Create a temporary flag object with the key
        const tempFlag = { key: definition.key } as Flag<ValueType>;
        return getPrecomputed(
          tempFlag,
          precomputedGroup,
          precomputedCode,
          effectiveSecret,
        );
      }

      let store = context().state._flag;

      if (!store) {
        if (args[0] instanceof Request) {
          const cached = requestMap.get(args[0]);
          if (!cached) {
            store = createContext(
              args[0],
              (args[1] as string) ?? (await tryGetSecret()),
            );
            requestMap.set(args[0], store);
          } else {
            store = cached;
          }
        } else {
          throw new Error('flags: Neither context found nor Request provided');
        }
      }

      const headers = sealHeaders(store.request.headers);
      const cookies = sealCookies(store.request.headers);

      const overridesCookie = cookies.get('vercel-flag-overrides')?.value;
      const overrides = await getOverrides(overridesCookie);

      let entities: EntitiesType | undefined;
      if (identify) {
        // Deduplicate calls to identify, key being the function itself
        if (!store.identifiers.has(identify)) {
          const entities = identify({
            headers,
            cookies,
          });
          store.identifiers.set(identify, entities);
        }

        entities = (await store.identifiers.get(identify)) as EntitiesType;
      }

      // Create entities key for caching like Next.js
      const entitiesKey = JSON.stringify(entities) ?? '';

      // Check sophisticated cache first
      const cachedValue = getCachedValuePromise(
        store.request.headers,
        definition.key,
        entitiesKey,
      );
      if (cachedValue !== undefined) {
        setSpanAttribute('method', 'cached');
        const value = await cachedValue;
        return value;
      }

      if (overrides && hasOwnProperty(overrides, definition.key)) {
        const value = overrides[definition.key];
        if (typeof value !== 'undefined') {
          setSpanAttribute('method', 'override');
          const resolvedPromise = Promise.resolve(value as JsonValue);
          store.usedFlags[definition.key] = resolvedPromise;

          // Also update the sophisticated cache
          setCachedValuePromise(
            store.request.headers,
            definition.key,
            entitiesKey,
            resolvedPromise,
          );

          internalReportValue(definition.key, value, {
            reason: 'override',
          });
          return value;
        }
      }

      // Use improved error handling
      const valuePromise = safeExecute(
        () =>
          decide({
            headers,
            cookies,
            entities,
          }),
        definition.defaultValue,
        (error) => {
          if (process.env.NODE_ENV === 'development') {
            console.info(
              `flags: Flag "${definition.key}" is falling back to its defaultValue`,
            );
          } else {
            console.warn(
              `flags: Flag "${definition.key}" is falling back to its defaultValue after catching the following error`,
              error,
            );
          }
        },
      ).then<ValueType, ValueType>((value) => {
        if (value !== undefined) return value;
        if (definition.defaultValue !== undefined)
          return definition.defaultValue;
        throw new Error(
          `flags: Flag "${definition.key}" must have a defaultValue or a decide function that returns a value`,
        );
      });

      store.usedFlags[definition.key] = valuePromise as Promise<JsonValue>;

      // Also update the sophisticated cache
      setCachedValuePromise(
        store.request.headers,
        definition.key,
        entitiesKey,
        valuePromise as Promise<JsonValue>,
      );

      const value = await valuePromise;
      if (definition.config?.reportValue !== false) {
        reportValue(definition.key, value);
      }
      return value;
    },
    {
      name: 'flag',
      isVerboseTrace: false,
      attributes: { key: definition.key },
    },
  ) as any as Flag<ValueType, EntitiesType>;

  // Add all the properties to make it compatible with Flag<ValueType>
  flagImpl.key = definition.key;
  flagImpl.defaultValue = definition.defaultValue;
  flagImpl.origin = origin;
  flagImpl.description = definition.description;
  flagImpl.options = normalizeOptions(definition.options);
  flagImpl.decide = trace(decide, {
    isVerboseTrace: false,
    name: 'decide',
    attributes: { key: definition.key },
  });
  flagImpl.identify = identify
    ? trace(identify, {
        isVerboseTrace: false,
        name: 'identify',
        attributes: { key: definition.key },
      })
    : identify;
  flagImpl.run = trace(run, {
    isVerboseTrace: false,
    name: 'run',
    attributes: { key: definition.key },
  });

  return flagImpl;
}

export type KeyedFlagDefinitionType = { key: string } & FlagDefinitionType;

export function getProviderData(
  flags: Record<
    string,
    // accept an unknown array
    KeyedFlagDefinitionType | readonly unknown[]
  >,
): ProviderData {
  const definitions = Object.values(flags)
    // filter out precomputed arrays
    .filter((i): i is KeyedFlagDefinitionType => !Array.isArray(i))
    .reduce<FlagDefinitionsType>((acc, d) => {
      // maps the existing type from the facet definitions to the type
      // the toolbar expects
      acc[d.key] = {
        options: d.options,
        origin: d.origin,
        description: d.description,
        defaultValue: d.defaultValue,
        declaredInCode: true,
      } satisfies FlagDefinitionType;
      return acc;
    }, {});

  return { definitions, hints: [] };
}

interface FlagContext {
  request: Request;
  secret: string;
  usedFlags: Record<string, Promise<JsonValue>>;
  identifiers: Map<Identify<unknown>, ReturnType<Identify<unknown>>>;
}

function createContext(
  request: Request,
  secret: string,
  params?: Record<string, string>,
): FlagContext {
  return {
    request,
    secret,
    usedFlags: {},
    identifiers: new Map(),
  };
}

/**
 * Establishes context for flags, so they have access to the
 * request and cookie.
 *
 * Also registers evaluated flags, except for flags used only after `resolve` calls in other handlers.
 *
 * @example Usage example in routes/(middlewares)/global.ts
 *
 * ```ts
 * import { createHandle } from 'flags/web-router';
 * import * as flags from '#config/flags';
 *
 * export default createHandle({
 *   flags,
 *   secret: process.env.FLAGS_SECRET,
 * });
 * ```
 *
 * @example Usage example with other middleware handlers
 *
 * ```ts
 * import { composeMiddleware } from '@web-widget/helpers';
 * import { createHandle } from 'flags/web-router';
 * import * as flags from '#config/flags';
 *
 * const flagsMiddleware = createHandle({
 *   flags,
 *   secret: process.env.FLAGS_SECRET,
 * });
 *
 * export default composeMiddleware([otherMiddleware, flagsMiddleware]);
 * ```
 *
 * Note that when composing `createHandle` with other middleware, `createHandle` should come after other middleware that don't require access to flags. Only handlers after it will be able to access feature flags.
 */
export function createHandle({
  secret,
  flags,
}: {
  secret?: string;
  flags?: Record<string, Flag<any>>;
}): MiddlewareHandler {
  return async function handle({ request, params, render }, next) {
    secret ??= await tryGetSecret(secret);

    if (
      flags &&
      // avoid creating the URL object for every request by checking with includes() first
      request.url.includes('/.well-known/') &&
      new URL(request.url).pathname === '/.well-known/vercel/flags'
    ) {
      return handleWellKnownFlagsRoute(request.headers, secret, flags);
    }

    // The current route is a page to inject flag
    if (!render) {
      return next();
    }

    context().state._flag = createContext(request, secret, params);
    const result = await next();

    // Modify the HTML response stream to inject flag values script after </body>
    if (result && result instanceof Response && result.body) {
      const contentType = result.headers.get('content-type')?.toLowerCase();
      if (contentType && contentType.includes('text/html')) {
        const transformStream = createFlagScriptInjectionTransform(async () => {
          const store = context().state._flag;
          if (!store || Object.keys(store.usedFlags).length === 0) return '';

          // This is for reporting which flags were used when this page was generated,
          // so the value shows up in Vercel Toolbar, without the client ever being
          // aware of this feature flag.
          const flagValues = await resolveObjectPromises(store.usedFlags);

          // Create a serialized representation of the flag values using the same
          // signing mechanism as Next.js, rather than encryption. This ensures
          // deterministic output across server restarts.
          const flagsArray = Object.keys(flagValues).map((key) => ({
            key,
            options: undefined,
          }));
          const serializedFlagValues = await serialize(
            flagValues,
            flagsArray,
            secret!, // secret is guaranteed to be defined at this point
          );

          return safeJsonStringify(serializedFlagValues);
        });
        const modifiedBody = result.body.pipeThrough(transformStream);

        return new Response(modifiedBody, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        });
      }
    }

    return result;
  };
}

async function handleWellKnownFlagsRoute(
  headers: Headers,
  secret: string,
  flags: Record<string, Flag<any>>,
) {
  const access = await verifyAccess(headers.get('authorization'), secret);
  if (!access) return new Response(null, { status: 401 });
  const providerData = getProviderData(flags);
  return Response.json(providerData, {
    headers: { 'x-flags-sdk-version': version },
  });
}

export async function encryptFlagValues(
  value: FlagValuesType,
  secret?: string,
) {
  return _encryptFlagValues(value, await tryGetSecret(secret));
}

export async function decryptFlagValues(
  encryptedData: string,
  secret?: string,
) {
  return _decryptFlagValues(encryptedData, await tryGetSecret(secret));
}

export async function encryptOverrides(
  overrides: FlagOverridesType,
  secret?: string,
) {
  return _encryptOverrides(overrides, await tryGetSecret(secret));
}

export async function decryptOverrides(encryptedData: string, secret?: string) {
  return _decryptOverrides(encryptedData, await tryGetSecret(secret));
}

export async function encryptFlagDefinitions(
  value: FlagDefinitionsType,
  secret?: string,
) {
  return _encryptFlagDefinitions(value, await tryGetSecret(secret));
}

export async function decryptFlagDefinitions(
  encryptedData: string,
  secret?: string,
) {
  return _decryptFlagDefinitions(encryptedData, await tryGetSecret(secret));
}

/**
 * Creates a well-known flags endpoint for WebRouter.
 * @param getApiData a function returning the API data
 * @param options accepts a secret
 * @returns a RequestHandler
 */
export function createFlagsDiscoveryEndpoint(
  getApiData: (context: MiddlewareContext) => Promise<ApiData> | ApiData,
  options?: {
    secret?: string | undefined;
  },
): MiddlewareHandler {
  return async (context) => {
    const access = await verifyAccess(
      context.request.headers.get('authorization'),
      options?.secret,
    );
    if (!access) return Response.json(null, { status: 401 });

    const apiData = await getApiData(context);
    return Response.json(apiData, {
      headers: { 'x-flags-sdk-version': version },
    });
  };
}
