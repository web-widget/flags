import { defineMiddlewareHandler } from '@web-widget/helpers';
import { computeFlagsCode, createVisitorId } from '#config/precomputed-flags';

export const handler = defineMiddlewareHandler(async (ctx, next) => {
  const { request } = ctx;
  const url = new URL(request.url);

  // Check if we need to reset the visitor ID
  const shouldReset = url.searchParams.has('resetVisitorId');

  // Parse cookies
  const cookies = request.headers.get('cookie') || '';
  const visitorIdMatch = cookies.match(/visitorId=([^;]+)/);
  let visitorId = visitorIdMatch ? visitorIdMatch[1] : null;

  // If no visitor ID or reset is requested, create a new one
  if (!visitorId || shouldReset) {
    visitorId = createVisitorId();
  }

  // Always ensure visitor ID is available in headers for flag evaluation
  request.headers.set('x-visitorId', visitorId);

  // Handle marketing-pages routes
  if (url.pathname.startsWith('/flags/marketing-pages')) {
    // If this is a subpath (like /flags/marketing-pages/abc123), redirect to clean URL
    // This handles old URLs that might still exist
    if (url.pathname !== '/flags/marketing-pages') {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/flags/marketing-pages',
          'Set-Cookie': `visitorId=${visitorId}; Path=/; HttpOnly`,
        },
      });
    }

    // If reset was requested, redirect to clean URL without parameter
    if (shouldReset) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/flags/marketing-pages',
          'Set-Cookie': `visitorId=${visitorId}; Path=/; HttpOnly`,
        },
      });
    }

    // For the exact /flags/marketing-pages path, compute and set the flags code header
    const flagsCode = await computeFlagsCode(request);
    request.headers.set('x-flags-code', flagsCode);
  }

  // Continue to the route handler
  const response = await next();

  // Set the visitor ID cookie if it wasn't already set or if reset was requested
  if (!visitorIdMatch || shouldReset) {
    response.headers.set(
      'Set-Cookie',
      `visitorId=${visitorId}; Path=/; HttpOnly`,
    );
  }

  return response;
});
