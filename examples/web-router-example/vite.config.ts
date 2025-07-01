/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { webRouterPlugin } from '@web-widget/vite-plugin';
import reactWebWidgetPlugin from '@web-widget/react/vite';
import vuePlugin from '@vitejs/plugin-vue';
import vueWebWidgetPlugin from '@web-widget/vue/vite';
import { builtinModules } from 'module';

export default defineConfig({
  plugins: [
    webRouterPlugin({
      serverAction: {
        enabled: true,
      },
      filesystemRouting: {
        enabled: true,
      },
      importShim: {
        enabled: true,
      },
    }),
    [react(), reactWebWidgetPlugin()],
    [vuePlugin(), vueWebWidgetPlugin()],
  ],
  build: {
    target: ['chrome76'],
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((module) => `node:${module}`),
      ],
    },
  },
  test: {
    api: {
      port: Number(process.env.TEST_PORT ?? 51204),
      strictPort: true,
    },
  },
});
