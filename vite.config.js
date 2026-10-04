import { defineConfig } from 'vite';

/** The local API origins in index.html's CSP are for `vite dev` only; drop them from the production build. */
function stripDevCspOrigins() {
  return {
    name: 'strip-dev-csp-origins',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(/ http:\/\/(127\.0\.0\.1|localhost):8787/g, '');
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [stripDevCspOrigins()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
