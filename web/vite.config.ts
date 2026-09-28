import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const site = mode === 'site';
  return {
    plugins: [
      react(),
      {
        name: 'notebaton-distribution',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => site
            ? html.replace('/src/main.tsx', '/src/site-main.tsx')
                .replace('Note · NoteBaton', 'NoteBaton · Pick up where inspiration strikes')
                .replace('NoteBaton：配对你的设备，在浏览器阅读、编辑和同步笔记。', 'NoteBaton 接力：手机里的灵感，电脑上接着写。')
            : html,
        },
        configureServer(server) {
          if (site) return;
          server.middlewares.use((request, response, next) => {
            const path = request.url?.split('?')[0];
            const type = path === '/favicon.svg' ? 'image/svg+xml'
              : path === '/third-party-notices.txt' ? 'text/plain; charset=utf-8' : null;
            if (!type) return next();
            response.setHeader('Content-Type', type);
            response.end(readFileSync(new URL(`./public${path}`, import.meta.url)));
          });
        },
        generateBundle() {
          if (site) return;
          // Self-hosted services ship only workspace assets, not the product site.
          for (const name of ['favicon.svg', 'third-party-notices.txt']) {
            this.emitFile({ type: 'asset', fileName: name, source: readFileSync(new URL(`./public/${name}`, import.meta.url)) });
          }
        },
      },
    ],
    publicDir: site ? 'public' : false,
    build: { outDir: site ? 'dist/site' : 'dist/relay', emptyOutDir: true },
    server: { port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
  };
});
