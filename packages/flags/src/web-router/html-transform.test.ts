import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFlagScriptInjectionTransform } from './html-transform';

// Mock process.env for testing
const originalEnv = process.env;

describe('createFlagScriptInjectionTransform', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  it('should inject script before </body> tag', async () => {
    const html = '<html><body><h1>Hello</h1></body></html>';
    const scriptContent = async () => '{"flag1":true}';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });

    const transform = createFlagScriptInjectionTransform(scriptContent);
    const transformedStream = stream.pipeThrough(transform);

    const reader = transformedStream.getReader();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }

    expect(result).toBe(
      '<html><body><h1>Hello</h1><script type="application/json" data-flag-values>{"flag1":true}</script></body></html>',
    );
  });

  it('should handle chunked processing', async () => {
    const chunks = ['<html><body>Hello</bo', 'dy></html>'];
    const scriptContent = async () => '{"flag2":true}';

    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    const transform = createFlagScriptInjectionTransform(scriptContent);
    const transformedStream = stream.pipeThrough(transform);

    const reader = transformedStream.getReader();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }

    expect(result).toBe(
      '<html><body>Hello<script type="application/json" data-flag-values>{"flag2":true}</script></body></html>',
    );
  });

  it('should handle empty script content', async () => {
    const html = '<html><body><h1>Hello</h1></body></html>';
    const scriptContent = async () => '';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });

    const transform = createFlagScriptInjectionTransform(scriptContent);
    const transformedStream = stream.pipeThrough(transform);

    const reader = transformedStream.getReader();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }

    // Should not inject script tag when content is empty
    expect(result).toBe('<html><body><h1>Hello</h1></body></html>');
  });

  it('should handle HTML without body tag', async () => {
    const html = '<html><head><title>Test</title></head></html>';
    const scriptContent = async () => '{"flag3":true}';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });

    const transform = createFlagScriptInjectionTransform(scriptContent);
    const transformedStream = stream.pipeThrough(transform);

    const reader = transformedStream.getReader();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }

    // Should not inject script tag when there's no body tag
    expect(result).toBe('<html><head><title>Test</title></head></html>');
  });
});
