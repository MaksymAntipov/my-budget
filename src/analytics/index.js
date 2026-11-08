import { GA_MEASUREMENT_ID } from '../config.js';
import { safeParams } from './model.js';

/**
 * Google Analytics 4 for the app and the public pages. Off in dev/tests and while GA_MEASUREMENT_ID is empty.
 * No user id, email or amounts are sent; Google signals and ad personalisation are off.
 */
const enabled = import.meta.env.PROD && Boolean(GA_MEASUREMENT_ID);
let started = false;

export function initAnalytics() {
    if (!enabled || started) return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.append(script);
}

/** One user action, e.g. track('ai_report', { kind: 'growth' }). Unknown parameters are dropped (model.js). */
export function track(name, params) {
    if (!enabled || !window.gtag) return;
    window.gtag('event', name, safeParams(params));
}
