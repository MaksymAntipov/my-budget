import './styles.css';
import { dotPosition, lastPoint } from './model.js';

/**
 * Brings a big summary sparkline to life after app.js has drawn it into `container`: the area under the line
 * breathes, a soft glow follows the line, and the current month's point pulses. Motion is CSS only and
 * stops under «reduce motion». Safe to call after every re-render.
 */
export function livenSparkline(container) {
    const svg = container?.querySelector('svg');
    const lines = svg?.querySelectorAll('polyline');
    if (!svg || !lines || lines.length < 2) return;
    const area = lines[0];
    const line = lines[lines.length - 1];
    const color = line.getAttribute('stroke') || '#32d74b';
    container.classList.add('is-live');
    container.style.setProperty('--spark-color', color);
    area.classList.add('spark-area');

    const glow = line.cloneNode();
    glow.classList.add('spark-glow');
    glow.setAttribute('stroke-width', '7');
    line.before(glow);

    const box = svg.viewBox.baseVal;
    const point = lastPoint(line.getAttribute('points'));
    const pos = point && dotPosition(point, box, Number(svg.getAttribute('height')) || 32);
    if (!pos) return;
    const dot = document.createElement('span');
    dot.className = 'spark-dot';
    dot.setAttribute('aria-hidden', 'true');
    // Kept fully inside: some cards bleed the chart to their clipped edge, which would cut the dot in half.
    dot.style.left = `clamp(5px, ${pos.left}%, calc(100% - 5px))`;
    dot.style.top = `${pos.top}px`;
    container.append(dot);
}
