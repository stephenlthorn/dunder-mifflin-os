import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The dev server proxies /api to the local server. DMOS_API_TARGET overrides it: the mocked e2e runs point it at a closed
// port, so a server already running on this machine can never answer a request a test forgot to mock.
const API_TARGET = process.env.DMOS_API_TARGET || 'http://127.0.0.1:4318';
// /login too, so a server started with DMOS_ACCESS_TOKEN can sign the dev browser in.
const apiProxy = { '/api': { target: API_TARGET, changeOrigin: false }, '/login': { target: API_TARGET, changeOrigin: false } };

/** Mode `static-demo` (`npm run build:demo-static`): demo.html becomes the index.html of a self-contained site. */
export const STATIC_DEMO_MODE = 'static-demo';

function demoPageAsIndex(): Plugin {
  return {
    name: 'dmos-static-demo-index',
    enforce: 'post',
    generateBundle: {
      order: 'post', // after Vite has written the page
      handler(_options, bundle) {
        const page = bundle['demo.html'];
        if (page?.type !== 'asset') return;
        delete bundle['demo.html'];
        this.emitFile({ type: 'asset', fileName: 'index.html', source: page.source });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const staticDemo = mode === STATIC_DEMO_MODE;
  return {
    plugins: [react(), ...(staticDemo ? [demoPageAsIndex()] : [])],
    resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
    server: { host: '127.0.0.1', port: 5173, proxy: apiProxy },
    preview: { host: '127.0.0.1', port: 4173, proxy: apiProxy },
    // relative asset paths, so the site works from any sub-path (e.g. https://<you>.github.io/dunder-mifflin-os/)
    // web/public-demo is copied as-is into the static site only (og.png, the link-preview image); the app build and
    // the npm package don't carry it.
    ...(staticDemo ? {
      base: './',
      publicDir: fileURLToPath(new URL('./public-demo', import.meta.url)),
      build: { outDir: 'dist-demo', emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL('./demo.html', import.meta.url)) } },
    } : {}),
  };
});
