import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { IncomingMessage } from 'node:http';
import { demoPath } from './demo-routes.ts';

function rewriteDemo(req: IncomingMessage, _res: unknown, next: () => void) {
  if ((req.method === 'GET' || req.method === 'HEAD') && demoPath.test(req.url?.split('?')[0] ?? '')) req.url = '/demo.html';
  next();
}
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'aladay-demo-routes',
        configureServer(server) { server.middlewares.use(rewriteDemo); },
        configurePreviewServer(server) { server.middlewares.use(rewriteDemo); },
      },
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 2500,
      rolldownOptions: { input: ['index.html', 'demo.html'] },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
