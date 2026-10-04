import './styles/app.css';
import './app.js';
import { bindUiActions } from './bind-ui.js';
import { initFamilyTree } from './family-tree/index.js';
import { initYearTracks } from './year-tracks/index.js';
import { initRunway } from './runway/index.js';

bindUiActions(document);

const getSession = () =>
  typeof window.__getBudgetSession === 'function' ? window.__getBudgetSession() : {};

// Isolated personal modules; session comes from app.js via __getBudgetSession.
initFamilyTree({ getSession });
initYearTracks({ getSession });
initRunway({
  getSession,
  getSnapshot: () =>
    typeof window.__getRunwaySnapshot === 'function' ? window.__getRunwaySnapshot() : null,
});
