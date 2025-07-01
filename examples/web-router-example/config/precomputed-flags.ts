import { precompute } from 'flags/web-router';
import { firstMarketingABTest, secondMarketingABTest } from './flags';

export const marketingFlags = [firstMarketingABTest, secondMarketingABTest];

/**
 * Compute the flags code for header-based precomputation
 * This avoids URL redirection and keeps the user-facing URL clean
 */
export async function computeFlagsCode(request: Request) {
  return await precompute(marketingFlags, request);
}

/**
 * @deprecated - Use header-based approach instead
 * Given a user-visible pathname, precompute the internal route using the flags used on that page
 *
 * e.g. /marketing -> /marketing/asd-qwe-123
 */
export async function computeInternalRoute(pathname: string, request: Request) {
  if (pathname === '/flags/marketing-pages') {
    return (
      '/flags/marketing-pages/' + (await precompute(marketingFlags, request))
    );
  }

  return pathname;
}

export function createVisitorId() {
  return crypto.randomUUID().replace(/-/g, '');
}
