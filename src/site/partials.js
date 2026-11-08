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

export function siteHeader() {
    return `<header class="site-header">
    <a class="site-logo" href="/" aria-label="MySkrynia — на головну">
        <img src="/icons/icon.svg?v=2" width="32" height="32" alt="">
        <span>MySkrynia</span>
    </a>
    <nav class="site-nav" aria-label="Розділи">
        ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n        ')}
    </nav>
    <a class="site-login" href="/">Увійти</a>
</header>`;
}

export function siteFooter() {
    return `<footer class="site-footer">
    <nav aria-label="Посилання">
        <a href="/">Головна</a>
        ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n        ')}
        <a href="/konfidentsiinist/">Конфіденційність</a>
    </nav>
    <p>MySkrynia — облік особистих фінансів. Питання: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
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
