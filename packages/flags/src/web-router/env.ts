let default_secret: string | undefined = process.env.FLAGS_SECRET;

export async function tryGetSecret(secret?: string): Promise<string> {
  secret = secret || default_secret;

  if (!secret) {
    throw new Error(
      'flags: No secret provided. Set an environment variable FLAGS_SECRET or provide a secret to the function.',
    );
  }

  return secret;
}
