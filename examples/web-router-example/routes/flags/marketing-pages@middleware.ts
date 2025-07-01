import { defineMiddlewareHandler } from '@web-widget/helpers';
import {
  computeInternalRoute,
  createVisitorId,
} from '#config/precomputed-flags';

export const handler = defineMiddlewareHandler(async (ctx, next) => {
  const { request } = ctx;
  const url = new URL(request.url);

  // Parse cookies
  const cookies = request.headers.get('cookie') || '';
  const visitorIdMatch = cookies.match(/visitorId=([^;]+)/);
  let visitorId = visitorIdMatch ? visitorIdMatch[1] : null;

  // If no visitor ID, create one
  if (!visitorId) {
    visitorId = createVisitorId();
  }

  // Always ensure visitor ID is available in headers for flag evaluation
  request.headers.set('x-visitorId', visitorId);

  // Only redirect if we're on the exact /flags/marketing-pages path
  if (url.pathname === '/flags/marketing-pages') {
    // Compute the internal route
    const internalRoute = await computeInternalRoute(
      '/flags/marketing-pages',
      request,
    );

    // Always redirect to the internal route
    if (internalRoute !== '/flags/marketing-pages') {
      return new Response(null, {
        status: 302,
        headers: {
          Location: internalRoute,
          'Set-Cookie': `visitorId=${visitorId}; Path=/; HttpOnly`,
        },
      });
    }
  }

  // Continue to the route handler (for both base path and internal routes)
  const response = await next();

  // Set the visitor ID cookie if it wasn't already set
  if (!visitorIdMatch) {
    response.headers.set(
      'Set-Cookie',
      `visitorId=${visitorId}; Path=/; HttpOnly`,
    );
  }

  return response;
});
