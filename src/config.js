// `vite dev` proxies /api to the local worker (vite.config.js): same origin, so no CORS and the session cookie just works.
export const API_URL = import.meta.env.DEV
  ? window.location.origin
  : 'https://api.myskrynia.com.ua';
