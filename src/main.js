import './styles/app.css';
import './styles/mobile.css';
import './app.js';
import { bindUiActions } from './bind-ui.js';
import { initFamilyTree } from './family-tree/index.js';
import { initYearTracks } from './year-tracks/index.js';
import { initRunway } from './runway/index.js';
import { initInvest } from './invest/index.js';
import { initSmartSticky } from './smart-sticky/index.js';

bindUiActions(document);
// Desktop summary card: scrolls along until its bottom shows, then holds (instead of an inner scroll).
initSmartSticky({ selector: '.right-panel .glass-card' });

// Installable app + offline page (public/sw.js). Not in `vite dev`, where it would cache dev modules.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered', err));
  });
}

const getSession = () =>
  typeof window.__getBudgetSession === 'function' ? window.__getBudgetSession() : {};

// Isolated personal modules; session comes from app.js via __getBudgetSession.
initFamilyTree({ getSession });
initYearTracks({ getSession });
initInvest({ getSession });
initRunway({
  getSession,
  getSnapshot: () =>
    typeof window.__getRunwaySnapshot === 'function' ? window.__getRunwaySnapshot() : null,
});
