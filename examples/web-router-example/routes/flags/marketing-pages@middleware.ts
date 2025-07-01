import { defineMiddlewareHandler } from '@web-widget/helpers';
import {
  computeInternalRoute,
  createVisitorId,
} from '../../config/precomputed-flags.ts';

export const handler = defineMiddlewareHandler(async (ctx, next) => {
  const { request } = ctx;
  const url = new URL(request.url);
  const cookies = request.headers.get('cookie') || '';

  // Only handle the exact /flags/marketing-pages path
  if (url.pathname !== '/flags/marketing-pages') {
    return next();
  }

  // Check if visitor ID exists in cookies
  const visitorIdMatch = cookies.match(/visitorId=([^;]+)/);
  let visitorId = visitorIdMatch ? visitorIdMatch[1] : null;

  // If no visitor ID, create one
  if (!visitorId) {
    visitorId = createVisitorId();

    // Create a new request with the visitor ID in headers for flag evaluation
    const modifiedRequest = new Request(request.url, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'x-visitorId': visitorId,
      },
      body: request.body,
    });

    // Compute the internal route with the new visitor ID
    const internalRoute = await computeInternalRoute(
      '/flags/marketing-pages',
      modifiedRequest,
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: internalRoute,
        'Set-Cookie': `visitorId=${visitorId}; Path=/; HttpOnly`,
      },
    });
  }

  // If visitor ID exists, compute the internal route
  const internalRoute = await computeInternalRoute(
    '/flags/marketing-pages',
    request,
  );

  // If the computed route is different from current path, redirect
  if (internalRoute !== '/flags/marketing-pages') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: internalRoute,
      },
    });
  }

  // Continue to the route handler if no redirect is needed
  return next();
});
