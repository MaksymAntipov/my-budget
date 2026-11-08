import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSection, siteFooter, siteHeader } from './partials.js';

test('the header marks the section of the page, subpages included', () => {
    assert.equal(currentSection('/onovlennya/index.html'), '/onovlennya/');
    assert.equal(currentSection('/kalkulyatory/50-30-20/index.html'), '/kalkulyatory/');
    assert.equal(currentSection('/konfidentsiinist/index.html'), '');
    assert.equal(currentSection('/404.html'), '');

    const header = siteHeader('/shi-analiz/index.html');

    assert.match(header, /<a href="\/shi-analiz\/" aria-current="page">ШІ-аналіз<\/a>/);
    assert.equal(header.match(/aria-current/g).length, 1);
});

test('the footer does not repeat the header sections', () => {
    const footer = siteFooter();

    assert.doesNotMatch(footer, /\/kalkulyatory\/|\/onovlennya\/|\/pro-proekt\/|\/shi-analiz\//);
    assert.match(footer, /\/konfidentsiinist\//);
    assert.match(footer, /hello@myskrynia\.com\.ua/);
});

test('the login screen gets the header without its own «Увійти» button', () => {
    assert.match(siteHeader(), /class="site-login"/);
    assert.doesNotMatch(siteHeader('', { login: false }), /site-login/);
});
