import { verifyAccessProof } from '../lib/crypto';

/**
 * Web-router version of verifyAccess function.
 * This function lets you verify whether a request to your application's .well-known/vercel/flags endpoint was made by the toolbar.
 * You can use verifyAccess to keep this endpoint private, to avoid public access of your feature flag definitions through that endpoint.
 *
 * @example Using verifyAccess in .well-known/vercel/flags to verify access and respond with unencrypted data.
 * ```
 *  import { verifyAccess } from "flags/web-router";
 *
 *  export async function GET(request: Request) {
 *    const access = await verifyAccess(request.headers.get("Authorization"));
 *    if (!access) return new Response(null, { status: 401 });
 *
 *    return Response.json({ definitions: {} })
 *  }
 * ```
 * @param authHeader the Authorization header to check
 * @param secret the FLAGS_SECRET (defaults to process.env.FLAGS_SECRET)
 * @returns True when the authorization header was valid
 */
export async function verifyAccess(
  // App Router returns null when a header is not defined
  // Pages Router returns undefined when a header is not defined
  // We support both so the API is slim in both cases
  authHeader: string | null | undefined,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
): Promise<boolean> {
  if (!authHeader) return false;
  if (!secret)
    throw new Error(
      'flags: verifyAccess was called without a secret. Please set FLAGS_SECRET environment variable.',
    );

  const valid = await verifyAccessProof(
    authHeader.replace(/^Bearer /i, ''),
    secret,
  );

  return valid;
}
