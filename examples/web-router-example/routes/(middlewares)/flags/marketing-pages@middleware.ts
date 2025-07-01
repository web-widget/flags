import { defineMiddlewareHandler } from '@web-widget/helpers';
import { ResponseCookies, RequestCookies } from '@web-widget/helpers/headers';
import { redirect } from '@web-widget/helpers/navigation';
import { computeFlagsCode, createVisitorId } from '#config/precomputed-flags';

export const handler = defineMiddlewareHandler(async (ctx, next) => {
  const { request } = ctx;
  const url = new URL(request.url);

  // Check if we need to reset the visitor ID
  const shouldReset = url.searchParams.has('resetVisitorId');

  // Get visitor ID from cookies using the framework helper
  const cookieStore = new RequestCookies(request.headers);
  let visitorId = cookieStore.get('visitorId')?.value || null;

  // If no visitor ID or reset is requested, create a new one
  if (!visitorId || shouldReset) {
    visitorId = createVisitorId();
  }

  // Always ensure visitor ID is available in headers for flag evaluation
  request.headers.set('x-visitorId', visitorId);

  // If reset was requested, redirect to clean URL without parameter
  if (shouldReset) {
    const response = redirect('/flags/marketing-pages');
    const responseCookies = new ResponseCookies(response.headers);
    responseCookies.set('visitorId', visitorId, {
      path: '/',
      httpOnly: true,
    });

    return response;
  }

  // Compute and set the flags code header
  const flagsCode = await computeFlagsCode(request);
  request.headers.set('x-flags-code', flagsCode);

  // Continue to the route handler
  const response = await next();

  // Set the visitor ID cookie if it wasn't already set
  if (!cookieStore.has('visitorId')) {
    const responseCookies = new ResponseCookies(response.headers);
    responseCookies.set('visitorId', visitorId, {
      path: '/',
      httpOnly: true,
    });
  }

  return response;
});
