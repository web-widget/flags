import { MiddlewareContext, MiddlewareHandler } from '@web-widget/schema';
import { context } from '@web-widget/helpers/context';
import {
  type ApiData,
  reportValue,
  safeJsonStringify,
  verifyAccess,
  type JsonValue,
  type FlagDefinitionsType,
  encryptFlagValues as _encryptFlagValues,
  decryptFlagValues as _decryptFlagValues,
  encryptOverrides as _encryptOverrides,
  decryptOverrides as _decryptOverrides,
  encryptFlagDefinitions as _encryptFlagDefinitions,
  decryptFlagDefinitions as _decryptFlagDefinitions,
  version,
} from '..';
import {
  Decide,
  FlagDeclaration,
  FlagOverridesType,
  FlagValuesType,
  Identify,
} from '../types';
import {
  type ReadonlyHeaders,
  HeadersAdapter,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';
import { normalizeOptions } from '../lib/normalize-options';
import { RequestCookies } from '@edge-runtime/cookies';
import { Flag, FlagsArray } from './types';
import {
  generatePermutations as _generatePermutations,
  getPrecomputed,
  precompute as _precompute,
} from './precompute';
import { tryGetSecret } from './env';

declare module '@web-widget/schema' {
  interface State {
    _flag: FlagContext;
  }
}

function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
}

const headersMap = new WeakMap<Headers, ReadonlyHeaders>();
const cookiesMap = new WeakMap<Headers, ReadonlyRequestCookies>();

function sealHeaders(headers: Headers): ReadonlyHeaders {
  const cached = headersMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = HeadersAdapter.seal(headers);
  headersMap.set(headers, sealed);
  return sealed;
}

function sealCookies(headers: Headers): ReadonlyRequestCookies {
  const cached = cookiesMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = RequestCookiesAdapter.seal(new RequestCookies(headers));
  cookiesMap.set(headers, sealed);
  return sealed;
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
): Identify<EntitiesType> | undefined {
  if (typeof definition.identify === 'function') {
    return definition.identify;
  }
  if (typeof definition.adapter?.identify === 'function') {
    return definition.adapter.identify;
  }
}

/**
 * Used when a flag is called outside of a request context, i.e. outside of the lifecycle of the `handle` hook.
 * This could be the case when the flag is called from edge middleware.
 */
const requestMap = new WeakMap<Request, FlagContext>();

/**
 * Creates a transform stream that conditionally injects flag values script before </body> tag in HTML content
 */
function createFlagScriptInjectionTransform(
  scriptContent: () => Promise<string>,
): TransformStream {
  let buffer = '';

  return new TransformStream({
    async transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      buffer += text;

      // Check if we have a complete </body> tag
      const bodyEndIndex = buffer.indexOf('</body>');
      if (bodyEndIndex !== -1) {
        const beforeBody = buffer.substring(0, bodyEndIndex);
        const afterBody = buffer.substring(bodyEndIndex + 7); // 7 is length of '</body>'

        // Check if we should inject the script when </body> is found
        let modifiedContent: string;
        const content = await scriptContent();
        if (content) {
          // Inject the script and reconstruct
          const scriptTag = `<script type="application/json" data-flag-values>${content}</script></body>`;
          modifiedContent = beforeBody + scriptTag + afterBody;
        } else {
          // Keep original content without injection
          modifiedContent = buffer;
        }

        controller.enqueue(new TextEncoder().encode(modifiedContent));
        buffer = '';
      } else {
        // If buffer gets too large without finding </body>, flush it
        if (buffer.length > 8192) {
          controller.enqueue(new TextEncoder().encode(buffer));
          buffer = '';
        }
      }
    },
    flush(controller) {
      // Flush any remaining content
      if (buffer.length > 0) {
        controller.enqueue(new TextEncoder().encode(buffer));
      }
    },
  });
}

/**
 * Declares a feature flag
 */
export function flag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(definition: FlagDeclaration<ValueType, EntitiesType>): Flag<ValueType> {
  const decide = getDecide<ValueType, EntitiesType>(definition);
  const identify = getIdentify(definition);

  const flagImpl = async function flagImpl(
    requestOrCode?: string | Request,
    flagsArrayOrSecret?: string | Flag<any>[],
  ): Promise<ValueType> {
    let store = context().state._flag;

    if (!store) {
      if (requestOrCode instanceof Request) {
        const cached = requestMap.get(requestOrCode);
        if (!cached) {
          store = createContext(
            requestOrCode,
            (flagsArrayOrSecret as string) ?? (await tryGetSecret()),
          );
          requestMap.set(requestOrCode, store);
        } else {
          store = cached;
        }
      } else {
        throw new Error('flags: Neither context found nor Request provided');
      }
    }

    if (
      typeof requestOrCode === 'string' &&
      Array.isArray(flagsArrayOrSecret)
    ) {
      return getPrecomputed(
        definition.key,
        flagsArrayOrSecret,
        requestOrCode,
        store.secret,
      );
    }

    if (hasOwnProperty(store.usedFlags, definition.key)) {
      const valuePromise = store.usedFlags[definition.key];
      if (typeof valuePromise !== 'undefined') {
        return valuePromise as Promise<ValueType>;
      }
    }

    const headers = sealHeaders(store.request.headers);
    const cookies = sealCookies(store.request.headers);

    const overridesCookie = cookies.get('vercel-flag-overrides')?.value;
    const overrides = overridesCookie
      ? await _decryptOverrides(overridesCookie, store.secret)
      : undefined;

    if (overrides && hasOwnProperty(overrides, definition.key)) {
      const value = overrides[definition.key];
      if (typeof value !== 'undefined') {
        reportValue(definition.key, value);
        store.usedFlags[definition.key] = Promise.resolve(value as JsonValue);
        return value;
      }
    }

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

    const valuePromise = decide({
      headers,
      cookies,
      entities,
    });
    store.usedFlags[definition.key] = valuePromise as Promise<JsonValue>;

    const value = await valuePromise;
    reportValue(definition.key, value);
    return value;
  };

  flagImpl.key = definition.key;
  flagImpl.defaultValue = definition.defaultValue;
  flagImpl.origin = definition.origin;
  flagImpl.description = definition.description;
  flagImpl.options = normalizeOptions(definition.options);
  flagImpl.decide = decide;
  flagImpl.identify = identify;

  return flagImpl;
}

export function getProviderData(flags: Record<string, Flag<any>>): ApiData {
  const definitions = Object.values(flags).reduce<FlagDefinitionsType>(
    (acc, d) => {
      acc[d.key] = {
        options: normalizeOptions(d.options),
        origin: d.origin,
        description: d.description,
      };
      return acc;
    },
    {},
  );

  return { definitions, hints: [] };
}

interface FlagContext {
  request: Request;
  secret: string;
  params: Record<string, string>;
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
    params: params ?? {},
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
 * @example Usage example in src/hooks.server.ts
 *
 * ```ts
 * import { createHandle } from 'flags/sveltekit';
 * import * as flags from '$lib/flags';
 *
 * export const handle = createHandle({ flags });
 * ```
 *
 * @example Usage example in src/hooks.server.ts with other handlers
 *
 * Note that when composing `createHandle` with `sequence` then `createHandle` should come first. Only handlers after it will be able to access feature flags.
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
      const contentType = result.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const transformStream = createFlagScriptInjectionTransform(async () => {
          const store = context().state._flag;
          if (!store || Object.keys(store.usedFlags).length === 0) return '';

          // This is for reporting which flags were used when this page was generated,
          // so the value shows up in Vercel Toolbar, without the client ever being
          // aware of this feature flag.
          const encryptedFlagValues = await _encryptFlagValues(
            await resolveObjectPromises(store.usedFlags),
            secret,
          );

          return safeJsonStringify(encryptedFlagValues);
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
 * Evaluate a list of feature flags and generate a signed string representing their values.
 *
 * This convenience function call combines `evaluate` and `serialize`.
 *
 * @param flags - list of flags
 * @returns - a string representing evaluated flags
 */
export async function precompute<T extends FlagsArray>(
  flags: T,
  request: Request,
  secret?: string,
): Promise<string> {
  return _precompute(flags, request, await tryGetSecret(secret));
}

/**
 * Generates all permutations given a list of feature flags based on the options declared on each flag.
 * @param flags - The list of feature flags
 * @param filter - An optional filter function which gets called with each permutation.
 * @param secret - The secret sign the generated permutation with
 * @returns An array of strings representing each permutation
 */
export async function generatePermutations(
  flags: FlagsArray,
  filter: ((permutation: Record<string, JsonValue>) => boolean) | null = null,
  secret?: string,
): Promise<string[]> {
  return _generatePermutations(flags, filter, await tryGetSecret(secret));
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
    if (!access) Response.json(null, { status: 401 });

    const apiData = await getApiData(context);
    return Response.json(apiData, {
      headers: { 'x-flags-sdk-version': version },
    });
  };
}
