import { chartYMax, formatCompactUah } from './model.js';

export const PALETTE = {
  pillow: {
    line: '#00d47e',
    glow: 'rgba(0, 212, 126, 0.55)',
    fillTop: 'rgba(0, 212, 126, 0.38)',
    fillBot: 'rgba(0, 212, 126, 0)',
    tagInk: '#0b0b0c',
  },
  debt: {
    line: '#ff9f0a',
    glow: 'rgba(255, 159, 10, 0.45)',
    fillTop: 'rgba(255, 159, 10, 0.32)',
    fillBot: 'rgba(255, 159, 10, 0)',
    tagInk: '#0b0b0c',
  },
};

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function glowPlugin(color) {
  return {
    id: 'rwGlow',
    beforeDatasetDraw(chart, args) {
      if (args.index !== 0) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.shadowColor = color.glow;
      ctx.shadowBlur = 18;
    },
    afterDatasetDraw(chart, args) {
      if (args.index !== 0) return;
      chart.ctx.restore();
    },
  };
}

function lastTagPlugin(color) {
  return {
    id: 'rwLastTag',
    afterDatasetsDraw(chart) {
      if (chart.$rwReveal && !chart.$rwReveal.done) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;
      const pt = meta.data[meta.data.length - 1];
      if (!pt || typeof pt.x !== 'number') return;
      const raw = chart.data.datasets[0]?.data[meta.data.length - 1];
      const label = formatCompactUah(raw);
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      const padX = 8;
      const h = 20;
      const w = ctx.measureText(label).width + padX * 2;
      const x = Math.max(4, Math.min(pt.x + 10, chart.width - w - 6));
      const y = pt.y - h / 2;
      roundRect(ctx, x, y, w, h, 6);
      ctx.fillStyle = color.line;
      ctx.fill();
      ctx.fillStyle = color.tagInk;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + padX, pt.y + 0.5);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = color.line;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0b0c';
      ctx.fill();
      ctx.restore();
    },
  };
}

function cubic(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return (mt * mt * mt * p0)
    + (3 * mt * mt * t * p1)
    + (3 * mt * t * t * p2)
    + (t * t * t * p3);
}

function alongPoints(pts, t) {
  const n = pts.length;
  if (!n) return { x: 0, y: 0 };
  if (n === 1) return { x: pts[0].x, y: pts[0].y };
  const pos = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(pos));
  const f = pos - i;
  const a = pts[i];
  const b = pts[i + 1];
  const c1x = a.controlPointNextX;
  const c1y = a.controlPointNextY;
  const c2x = b.controlPointPreviousX;
  const c2y = b.controlPointPreviousY;
  if ([c1x, c1y, c2x, c2y].every(Number.isFinite)) {
    return {
      x: cubic(a.x, c1x, c2x, b.x, f),
      y: cubic(a.y, c1y, c2y, b.y, f),
    };
  }
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
  };
}

function easeInOutCubic(p) {
  return p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

function drawTraveler(ctx, x, y, color) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fillStyle = color.glow;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = color.line;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0b0c';
  ctx.fill();
  ctx.restore();
}

function revealPlugin(color) {
  return {
    id: 'rwReveal',
    beforeInit(chart) {
      const n = chart.data?.datasets?.[0]?.data?.length || 0;
      if (prefersReducedMotion() || n < 2) {
        chart.$rwReveal = { t: 1, done: true, raf: 0, clipped: false, cancelled: false, loopStarted: true };
        return;
      }
      chart.$rwReveal = { t: 0, done: false, raf: 0, clipped: false, cancelled: false, loopStarted: false };
    },
    afterRender(chart) {
      const state = chart.$rwReveal;
      if (!state || state.done || state.cancelled || state.loopStarted) return;
      state.loopStarted = true;
      const n = chart.data?.datasets?.[0]?.data?.length || 1;
      const duration = Math.min(2200, 900 + Math.max(0, n - 1) * 140);
      const started = performance.now();
      const tick = (now) => {
        if (!chart.ctx || state.cancelled) return;
        const p = Math.min(1, (now - started) / duration);
        state.t = easeInOutCubic(p);
        if (p >= 1) {
          state.t = 1;
          state.done = true;
          chart.draw();
          return;
        }
        chart.draw();
        state.raf = requestAnimationFrame(tick);
      };
      state.raf = requestAnimationFrame(tick);
    },
    beforeDestroy(chart) {
      const state = chart.$rwReveal;
      if (!state) return;
      state.cancelled = true;
      if (state.raf) cancelAnimationFrame(state.raf);
    },
    beforeDatasetsDraw(chart) {
      const state = chart.$rwReveal;
      const t = state?.t ?? 1;
      if (!state || t >= 1) return;
      const pts = chart.getDatasetMeta(0)?.data;
      if (!pts?.length) return;
      const pos = alongPoints(pts, t);
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, pos.x + 14, chart.height);
      ctx.clip();
      state.clipped = true;
    },
    afterDatasetsDraw(chart) {
      const state = chart.$rwReveal;
      if (state?.clipped) {
        chart.ctx.restore();
        state.clipped = false;
      }
      if (!state || state.done || (state.t ?? 1) >= 1) return;
      const pts = chart.getDatasetMeta(0)?.data;
      if (!pts?.length) return;
      const pos = alongPoints(pts, state.t);
      drawTraveler(chart.ctx, pos.x, pos.y, color);
    },
  };
}

function hairlinePlugin() {
  return {
    id: 'rwHairline',
    afterDraw(chart) {
      const actives = chart.tooltip?.getActiveElements?.() || [];
      if (!actives.length) return;
      const x = actives[0].element?.x;
      const area = chart.chartArea;
      if (typeof x !== 'number' || !area) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
}

function fillGradient(color) {
  return function backgroundColor(ctx) {
    const chart = ctx.chart;
    const area = chart.chartArea;
    if (!area) return color.fillTop;
    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, color.fillTop);
    g.addColorStop(1, color.fillBot);
    return g;
  };
}

/**
 * @param {string[]} labels
 * @param {number[]} data
 * @param {number} target
 * @param {'pillow' | 'debt'} kind
 */
export function geckoLineConfig(labels, data, target, kind) {
  const color = PALETTE[kind] || PALETTE.pillow;
  const yMax = chartYMax(data, target);
  const showTarget = target > 0 && yMax > 0 && target <= yMax * 1.02;
  const datasets = [
    {
      label: 'Факт',
      data,
      borderColor: color.line,
      backgroundColor: fillGradient(color),
      fill: 'origin',
      borderWidth: 2.5,
      tension: 0.35,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: color.line,
      pointBorderColor: '#0b0b0c',
      pointBorderWidth: 2,
      pointHoverBackgroundColor: color.line,
      pointHoverBorderColor: '#0b0b0c',
      pointHoverBorderWidth: 2,
    },
  ];
  if (showTarget) {
    datasets.push({
      label: 'Ціль',
      data: labels.map(() => target),
      borderColor: 'rgba(142, 142, 147, 0.7)',
      borderDash: [5, 5],
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
    });
  }
  return {
    type: 'line',
    data: { labels, datasets },
    plugins: [glowPlugin(color), lastTagPlugin(color), hairlinePlugin(), revealPlugin(color)],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 10, right: 76, left: 2, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 22, 0.94)',
          titleColor: '#a1a1a6',
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label(ctx) {
              if (ctx.datasetIndex !== 0) return '';
              const n = Number(ctx.parsed.y) || 0;
              return `${n.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#8e8e93',
            font: { size: 11, weight: '600' },
            maxRotation: 0,
            autoSkip: false,
            maxTicksLimit: 24,
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: yMax > 0 ? yMax : undefined,
          grid: {
            color: 'rgba(255,255,255,0.07)',
            lineWidth: 1,
            drawTicks: false,
          },
          border: { display: false, dash: [3, 6] },
          ticks: {
            color: '#8e8e93',
            padding: 8,
            font: { size: 11, weight: '600' },
            callback(value) {
              return formatCompactUah(value);
            },
          },
        },
      },
    },
  };
}
