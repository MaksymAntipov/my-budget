// Phones: the sections row scrolls, so bring the current one into view (otherwise it may sit under the fade).
const nav = document.querySelector('.site-nav');
const current = nav?.querySelector('a[aria-current="page"]');
if (nav && current && nav.scrollWidth > nav.clientWidth) {
    const fade = 28;
    const right = current.offsetLeft + current.offsetWidth;
    if (right > nav.scrollLeft + nav.clientWidth - fade) nav.scrollLeft = right - nav.clientWidth + fade;
}
