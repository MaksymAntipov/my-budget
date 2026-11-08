// Shared header/footer of the public pages and the prerendered changelog.
// Inserted at build (and in dev) by the `site-partials` plugin in vite.config.js into
// <!--site:header-->, <!--site:footer--> and <!--site:changelog--> placeholders.
import { escapeHtml } from '../utils.js';

export const CONTACT_EMAIL = 'hello@myskrynia.com.ua';

const NAV = [
    ['/shi-analiz/', 'ШІ-аналіз'],
    ['/kalkulyatory/', 'Калькулятори'],
    ['/onovlennya/', 'Оновлення'],
    ['/pro-proekt/', 'Про проєкт'],
];

/** Page path at build ('/kalkulyatory/50-30-20/index.html') → the NAV entry it belongs to, or ''. */
export function currentSection(path = '') {
    const page = String(path).replace(/index\.html$/, '');
    return NAV.map(([href]) => href).find((href) => page.startsWith(href)) || '';
}

/** `login: false` on the login screen itself (index.html), where the form is right below. */
export function siteHeader(path = '', { login = true } = {}) {
    const current = currentSection(path);
    return `<header class="site-header">
    <a class="site-logo" href="/" aria-label="MySkrynia — на головну">
        <img src="/icons/icon.svg?v=2" width="32" height="32" alt="">
        <span>MySkrynia</span>
    </a>
    <nav class="site-nav" aria-label="Розділи">
        ${NAV.map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('\n        ')}
    </nav>${login ? '\n    <a class="site-login" href="/">Увійти</a>' : ''}
</header>`;
}

/** Only what the header lacks: the sections are already up there. */
export function siteFooter() {
    return `<footer class="site-footer">
    <p>MySkrynia — облік особистих фінансів · <a href="/konfidentsiinist/">Конфіденційність</a> · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</footer>`;
}

export function changelogHtml(entries) {
    return entries.map((item) => `<article class="site-release">
    <h2><span>${escapeHtml(item.date)}</span> <span class="site-release-version">${escapeHtml(item.version)}</span></h2>
    <ul>
        ${item.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('\n        ')}
    </ul>
</article>`).join('\n');
}
