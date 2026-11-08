// `vite dev` proxies /api to the local worker (vite.config.js): same origin, so no CORS and the session cookie just works.
/** Google Analytics 4 measurement id (G-…); empty = analytics off. Set it to turn GA on in prod builds. */
export const GA_MEASUREMENT_ID = 'G-F63C15SH8X';

export const API_URL = import.meta.env.DEV
  ? window.location.origin
  : 'https://api.myskrynia.com.ua';
