import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { siteHeader, siteFooter, changelogHtml } from './src/site/partials.js';
import { CHANGELOG } from './src/changelog.js';

/** Public pages (SEO): each is its own HTML entry next to the app's index.html. */
const SITE_PAGES = [
  '404.html',
  'shi-analiz/index.html',
  'pro-proekt/index.html',
  'konfidentsiinist/index.html',
  'onovlennya/index.html',
  'kalkulyatory/index.html',
  'kalkulyatory/50-30-20/index.html',
  'kalkulyatory/vartist-zvychky/index.html',
  'kalkulyatory/vartist-hodyny/index.html',
];

/** Shared header/footer and the changelog for the public pages (see src/site/partials.js). */
function sitePartials() {
  return {
    name: 'site-partials',
    transformIndexHtml(html) {
      return html
        .replace('<!--site:header-->', siteHeader())
        .replace('<!--site:footer-->', siteFooter())
        .replace('<!--site:changelog-->', changelogHtml(CHANGELOG));
    },
  };
}

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
  plugins: [stripDevCspOrigins(), sitePartials()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: Object.fromEntries(
        ['index.html', ...SITE_PAGES].map((page) => [page.replace(/(\/index)?\.html$/, '') || 'main', resolve(import.meta.dirname, page)]),
      ),
    },
  },
  server: {
    port: 5173,
    open: false,
    // Local API (`npm run dev` in my-budget-backend) on the same origin as the page.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
