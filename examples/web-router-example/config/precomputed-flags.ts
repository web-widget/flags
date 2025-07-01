import { precompute } from 'flags/web-router';
import { firstMarketingABTest, secondMarketingABTest } from './flags';

export const marketingFlags = [firstMarketingABTest, secondMarketingABTest];

/**
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
