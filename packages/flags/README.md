![hero illustration](./assets/hero-dark.png)

# Flags SDK

The feature flags toolkit for Next.js, SvelteKit, and Web Router.

From the creators of Next.js, the Flags SDK is a free open-source library that gives you the tools you need to use feature flags in Next.js, SvelteKit, and Web Router applications.

- Works with any flag provider, custom setups or no flag provider at all
- Compatible with App Router, Pages Router, and Edge Middleware
- Built for feature flags and experimentation

See [flags-sdk.dev](https://flags-sdk.dev/) for full docs and examples.

## Fork Differences

This is a fork of the original Vercel Flags SDK with enhanced Web Router support. Key differences from the upstream project:

- **Enhanced Web Router Integration**: Full-featured Web Router support with precomputation, middleware patterns, and intelligent caching
- **Framework-Specific Error Handling**: Improved error messages and handling tailored for different frameworks
- **Complete Web Router Examples**: Comprehensive examples demonstrating dashboard pages, marketing pages, and manual approaches
- **Consistent API Design**: Implementation aligned with Next.js patterns for better developer experience

> Upgrading from version 3? See the [Upgrade to v4](https://github.com/vercel/flags/blob/main/packages/flags/guides/upgrade-to-v4.md) guide.

## Installation

Install the package using your package manager:

```sh
npm install flags
```

## Setup

Create an environment variable called `FLAGS_SECRET`.

The `FLAGS_SECRET` value must have a specific length (32 random bytes encoded in base64) to work as an encryption key. Create one using node:

```sh
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

This secret is required to use the SDK. It is used to read overrides and to encrypt flag values in case they are sent to the client and should stay secret.

## Usage

Create a file called flags.ts in your project and declare your first feature flag there:

```ts
// app/flags.tsx
import { flag } from 'flags/next';

export const exampleFlag = flag<boolean>({
  key: 'example-flag',
  decide() {
    return true;
  },
});
```

Call your feature flag in a React Server Component:

```tsx
// app/page.tsx
import { exampleFlag } from './flags';

export default async function Page() {
  const example = await exampleFlag();
  return <div>{example ? 'Flag is on' : 'Flag is off'}</div>;
}
```

Feature Flags can also be called in Edge Middleware and API Routes.

## Adapters

The Flags SDK has adapters for popular feature flag providers including LaunchDarkly, Optimizely, and Statsig.

## Documentation

There is a lot more to the Flags SDK than shown in the example above.

See the full documentation and examples on [flags-sdk.dev](https://flags-sdk.dev/).
