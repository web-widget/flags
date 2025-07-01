# Web Router Example - Flags SDK

This example demonstrates how to use the [Flags SDK](https://flags-sdk.dev) with Web Router to implement feature flags in different scenarios and architectures.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The application will be available at `http://localhost:5173` (or another port if 5173 is in use).

## 📁 Project Structure

```
examples/web-router-example/
├── config/
│   ├── flags.ts                    # Flag definitions and evaluation logic
│   └── precomputed-flags.ts        # Precomputation utilities
├── routes/
│   ├── (middlewares)/              # Middleware functions
│   │   └── flags/
│   │       └── marketing-pages@middleware.ts
│   └── flags/
│       ├── dashboard-pages/        # User-controlled pages example
│       ├── marketing-pages/        # Content-driven pages example
│       └── marketing-pages-manual-approach/  # Simple approach example
└── README.md
```

## 🎯 Examples Overview

### 1. Dashboard Pages - User-Controlled Pages

**Path:** `/flags/dashboard-pages`

Demonstrates feature flags on pages where **users have direct control** over the flag values.

**Key Features:**

- Users can toggle flags through UI controls
- Flags are controlled via cookies
- Immediate feedback when flags change
- Suitable for admin panels, dashboards, settings pages

**Implementation:**

```typescript
// Flag controlled by user via cookie
const flagValue = await showNewDashboard(request);

// UI allows direct control
<FlagControls flagName="showNewDashboard" cookieName="showNewDashboard" />
```

### 2. Marketing Pages - Content-Driven Pages

**Path:** `/flags/marketing-pages`

Demonstrates feature flags on pages where content is **predetermined by the system** based on visitor characteristics.

**Key Features:**

- Flags determined by visitor ID (system-controlled)
- Uses header-based precomputation for performance
- Clean URLs (no flag codes in URL)
- Suitable for A/B testing, personalized content, marketing campaigns

**Implementation:**

```typescript
// Flags determined by system logic
const flag1 = await firstMarketingABTest(request);
const flag2 = await secondMarketingABTest(request);

// Precomputed for performance
const flagsCode = request.headers.get('x-flags-code');
```

### 3. Marketing Pages (Manual Approach)

**Path:** `/flags/marketing-pages-manual-approach`

Shows a **simple but less scalable** approach to implementing feature flags.

**Key Features:**

- Direct flag evaluation in each route
- No precomputation optimization
- Easier to understand for beginners
- Suitable for small projects or prototypes

## 🔧 Technical Implementation Details

### Flag Definitions

All flags are defined in `config/flags.ts` with custom evaluation logic:

```typescript
export const firstMarketingABTest = flag<boolean>({
  key: 'firstMarketingABTest',
  description: 'First Marketing AB Test',
  decide({ entities }) {
    // Hash-based evaluation for consistent results
    const hash = simpleHash(entities?.visitorId + 'first');
    return hash % 100 < 50; // 50% probability
  },
});
```

### Precomputation Strategy

For content-driven pages, we use a header-based precomputation approach:

1. **Middleware** computes flag combinations and sets custom header
2. **Route handler** reads the precomputed result
3. **Clean URLs** - no flag codes exposed to users
4. **Performance** - enables caching and optimization

```typescript
// Middleware sets header
const flagsCode = await computeFlagsCode(request);
request.headers.set('x-flags-code', flagsCode);

// Route reads header
const flagsCode = request.headers.get('x-flags-code') || 'unknown';
```

### Visitor ID Management

The system automatically manages visitor IDs for consistent flag evaluation:

- **HttpOnly cookies** for security
- **Automatic generation** for new visitors
- **Reset functionality** for testing different combinations
- **Middleware handling** for seamless integration

## 🎭 Key Concepts

### Content-Driven vs User-Controlled Pages

| Aspect           | Content-Driven          | User-Controlled      |
| ---------------- | ----------------------- | -------------------- |
| **Control**      | System determines       | User chooses         |
| **Use Cases**    | Marketing, A/B testing  | Dashboards, settings |
| **Consistency**  | Based on visitor ID     | Based on user action |
| **Optimization** | Precomputation possible | Real-time evaluation |

### Header-Based Precomputation Benefits

1. **Clean URLs** - No flag codes in user-visible URLs
2. **Better SEO** - Consistent URLs for search engines
3. **Enhanced UX** - No confusing URL parameters
4. **Cacheable** - Enables CDN and browser caching strategies

### Visitor ID Strategy

```typescript
// Consistent flag evaluation across sessions
const visitorId = crypto.randomUUID().replace(/-/g, '');
// Flags determined by: hash(visitorId + flagKey) % 100
```

## 🏗️ Architecture Patterns

### Middleware Pattern

```typescript
// Centralized visitor ID and flag preprocessing
export const handler = defineMiddlewareHandler(async (ctx, next) => {
  // Set visitor ID
  request.headers.set('x-visitorId', visitorId);

  // Precompute flags
  const flagsCode = await computeFlagsCode(request);
  request.headers.set('x-flags-code', flagsCode);

  return next();
});
```

### Route Handler Pattern

```typescript
// Clean separation of concerns
export const handler = defineRouteHandler({
  async GET({ request, render }) {
    const flag1 = await firstMarketingABTest(request);
    const flag2 = await secondMarketingABTest(request);

    return render({ data: { flag1, flag2 } });
  },
});
```

## 🔧 Development Tips

### Testing Different Flag Combinations

1. Visit any marketing page
2. Click "Reset visitor ID" to generate a new visitor ID
3. Observe different flag combinations
4. Check browser cookies to see the visitor ID

### Debugging Flag Evaluation

The marketing pages show implementation details including:

- Current precomputed flags code
- Individual flag values
- Visitor ID information (when implemented)

### Adding New Flags

1. Define flag in `config/flags.ts`
2. Add to `marketingFlags` array in `config/precomputed-flags.ts`
3. Use in route handlers with `await flagName(request)`

## 📚 Related Documentation

- [Flags SDK Documentation](https://flags-sdk.dev)
- [Web Router Documentation](https://web-router.dev)
- [GitHub Repository](https://github.com/vercel/flags)

## 🤝 Contributing

This example is part of the Flags SDK monorepo. See the main [contribution guidelines](../../CONTRIBUTING.md) for details on how to contribute.

## 📄 License

This example is licensed under the same license as the Flags SDK. See [LICENSE.md](../../LICENSE.md) for details.
