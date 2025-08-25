# Koa 预计算 (Precompute)

## 背景信息

在 Next.js 生态系统中，Flag 系统提供了强大的预计算功能，允许在服务端预先生成 flag 值并序列化为字符串，然后在客户端快速反序列化获取结果。这种机制可以显著提升性能，减少服务端的重复计算。

然而，在 Koa 框架中使用 Flag 的预计算功能时，遇到了一个关键限制：

### 问题分析

1. **Flag 预计算的限制**：Flag 的 `precompute` 和 `evaluate` 函数不支持动态传入 `request` 对象
2. **Flag 函数的灵活性**：`flag/next` 提供的 flag 函数本身是支持传递 `request` 参数的 [参考 Pages Router](https://flags-sdk.dev/frameworks/next#pages-router)
3. **Koa 环境的需求**：在 Koa 应用中，不支持 Flag 内部自动获取 `request` ，需要手动传入

### 核心矛盾

```typescript
// flag 的预计算函数不支持 request 参数
export async function precompute<T extends FlagsArray>(
  flags: T,
  // ❌ 没有 request 参数
): Promise<string>;

// 但 flag 函数本身支持 request 参数
const flag = flag<boolean>({
  key: 'user-feature',
  decide: (request) => {
    // ✅ 可以访问 request 中的 cookies、headers 等
    return request?.cookies?.['user-type'] === 'premium';
  },
});
```

## 解决方案

为了解决这个问题，我们为 Koa 环境提供了增强版的预计算函数，支持动态传入 `request` 对象：

### 新增功能

1. **支持 request 参数的 evaluate 函数**
2. **支持 request 参数的 precompute 函数**
3. **完整的类型安全支持**
4. **向后兼容性**

### 实现原理

```typescript
// Koa 的增强版预计算函数
export async function evaluate<T extends FlagsArray>(
  flags: T,
  request?: KoaRequest, // ✅ 支持可选的 request 参数
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;

export async function precompute<T extends FlagsArray>(
  flags: T,
  request?: KoaRequest, // ✅ 支持可选的 request 参数
): Promise<string>;
```

## 使用示例

### 基本用法

```typescript
import { flag } from '@web-widget/flags/next';
import { precompute, evaluate } from '@web-widget/flags/koa';

// 定义支持 request 的 flag
const userFeatureFlag = flag<boolean>({
  key: 'user-feature',
  decide: (request) => {
    // 基于请求上下文决定 flag 值
    const userType = request?.cookies?.['user-type'];
    return userType === 'premium';
  },
});

const themeFlag = flag<string>({
  key: 'theme',
  decide: (request) => {
    // 基于 cookies 决定主题
    return request?.cookies?.['theme'] || 'light';
  },
});

const flags = [userFeatureFlag, themeFlag];
```

### 预计算使用

```typescript
// 在 Koa 中间件中使用
app.use(async (ctx, next) => {
  // 创建 Koa 兼容的 request 对象
  const koaRequest = {
    cookies: ctx.cookies,
    headers: ctx.headers,
    // 其他必要的属性...
  };

  try {
    // 预计算所有 flags
    const precomputedCode = await precompute(flags, koaRequest);

    // 将预计算的结果传递给客户端
    ctx.state.precomputedFlags = precomputedCode;

    await next();
  } catch (error) {
    console.error('Flag precompute failed:', error);
    await next();
  }
});
```

### 动态评估

```typescript
// 直接评估 flags（不进行预计算）
app.use(async (ctx, next) => {
  const koaRequest = {
    cookies: ctx.cookies,
    headers: ctx.headers,
  };

  try {
    // 直接评估 flags
    const flagValues = await evaluate(flags, koaRequest);

    // 使用评估结果
    ctx.state.userFeature = flagValues[0]; // userFeatureFlag 的值
    ctx.state.theme = flagValues[1]; // themeFlag 的值

    await next();
  } catch (error) {
    console.error('Flag evaluation failed:', error);
    await next();
  }
});
```

## 类型定义

### KoaRequest 类型

```typescript
type KoaRequestCookies = Partial<{
  [key: string]: string;
}>;

type KoaRequest = IncomingMessage & {
  cookies: KoaRequestCookies;
};
```

### 函数签名

```typescript
// 评估 flags
export async function evaluate<T extends FlagsArray>(
  flags: T,
  request?: KoaRequest,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;

// 预计算 flags
export async function precompute<T extends FlagsArray>(
  flags: T,
  request?: KoaRequest,
): Promise<string>;

// 反序列化
export async function deserialize(
  flags: FlagsArray,
  code: string,
  secret?: string,
): Promise<Record<string, JsonValue>>;

// 获取预计算的值
export async function getPrecomputed<T extends JsonValue>(
  flag: Flag<T, any>,
  precomputeFlags: FlagsArray,
  code: string,
  secret?: string,
): Promise<T>;
```
