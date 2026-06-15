/* PressPilot V2 — main.js
   Entry point. Hash-based router. Auth guard. Boot sequence.

   Navigation is exposed on window.PP_navigate to avoid circular ES module
   imports (articles.js / issues.js / dashboard.js / calendar.js need to
   navigate to other routes, but importing main.js would create a cycle). */

import * as State     from './state.js';
import * as API       from './api.js';
import * as Views     from './views.js';
import { loadStatsBar, setupSidebar, setActiveNav, setTopbarTitle, setupToast } from './ui-shell.js';
import { setupCmdPalette } from './cmd-palette.js';

// ── MODULE REGISTRY ───────────────────────────────────────────────────────────
// Lazy-loaded on first navigate; modules expose { mount, unmount }
const MODULE_DEFS = {
  dashboard: { title: 'Dashboard',           icon: '📊', load: () => import('./dashboard.js') },
  articles:  { title: 'Articles',            icon: '📝', load: () => import('./articles.js') },
  magazines: { title: 'Magazines',           icon: '📰', load: () => import('./issues.js') },
  cdf:       { title: 'Conducteur (CDF)',    icon: '🗺', load: () => import('./cdf.js') },
  calendar:  { title: 'Calendrier',          icon: '📅', load: () => import('./calendar.js') },
  billing:   { title: 'Facturation',         icon: '💶', load: () => import('./billing.js') },
  settings:  { title: 'Paramètres',          icon: '⚙️', load: () => import('./settings.js') },
};

let _currentRoute   = null;
let _currentModule  = null; // { mount, unmount }
let _contentArea    = null;

// ── NAVIGATION ────────────────────────────────────────────────────────────────
// Also exposed on window.PP_navigate to allow cross-module calls without cycles
export async function navigate(route) {
  if (!route || !MODULE_DEFS[route]) route = 'dashboard';
  const def = MODULE_DEFS[route];

  // Unmount current module
  if (_currentModule?.unmount) _currentModule.unmount();
  _currentModule = null;

  // Update hash (without re-triggering hashchange)
  const newHash = '#' + route;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }

  _currentRoute = route;
  setActiveNav(route);
  setTopbarTitle(def.title);

  // Lazy-load the module
  const mod = await def.load();
  _currentModule = mod;

  // Mount into content area
  if (_contentArea) {
    // CDF is a modal, not a page — redirect to dashboard
    if (route === 'cdf') {
      await navigate('dashboard');
      return;
    }
    _contentArea.innerHTML = '';
    mod.mount(_contentArea);

    // Apply default view if available
    const viewMod = await import('./views.js');
    const applyMap = {
      articles: 'applyArticlesState',
      magazines: 'applyMagazinesState',
      calendar: 'applyCalendarState',
      dashboard: 'applyDashboardState',
    };
    if (applyMap[route]) {
      const dv = viewMod.findDefaultView(route);
      if (dv) {
        const artMod = route === 'articles' ? await import('./articles.js')
                     : route === 'magazines' ? await import('./issues.js')
                     : route === 'calendar'  ? await import('./calendar.js')
                     : await import('./dashboard.js');
        artMod[applyMap[route]]?.(dv.state);
      }
    }
  }
}

export function reloadCurrentModule() {
  if (_currentRoute) navigate(_currentRoute);
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
async function boot() {
  // Check auth: if API returns 401 it redirects automatically (api.js)
  try {
    const [cfg, issues, dash] = await Promise.all([
      API.getConfig(),
      API.getIssues(),
      API.getDashboard(),
    ]);
    State.setCfg(cfg);
    State.setAllIssues(issues);
    const byKey = {};
    (dash.by_issue || []).forEach(bi => { byKey[`${bi.magazine}|${bi.numero}`] = bi; });
    State.setArticlesByKey(byKey);
  } catch (e) {
    if (e.message === 'Unauthenticated') return; // redirect handled by api.js
    console.error('Boot error', e);
    return;
  }

  // Load views from server
  await Views.loadViewsFromServer();

  // Wire shell
  _contentArea = document.getElementById('content-area');
  setupSidebar();
  setupToast();
  setupCmdPalette();
  setupNavItems();

  // Stats bar
  await loadStatsBar();
  setInterval(() => loadStatsBar(), 60000);

  // Route from URL hash or default
  const hash = window.location.hash.slice(1) || 'dashboard';
  await navigate(hash);
}

function setupNavItems() {
  document.querySelectorAll('.nav-item[data-route]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.route);
      // Close mobile drawer if open
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar?.classList.remove('mobile-open');
      overlay?.classList.remove('visible');
    });
  });
}

// Handle browser back/forward
window.addEventListener('hashchange', () => {
  const route = window.location.hash.slice(1) || 'dashboard';
  navigate(route);
});

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', boot);

// Expose navigate globally so other modules can call it without circular imports
window.PP_navigate = navigate;
