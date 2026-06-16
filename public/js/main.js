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
import { REDAC_COLOR_DEFAULT, TYPE_MAGAZINE_DEFAULT } from './helpers.js';

// ── MODULE REGISTRY ───────────────────────────────────────────────────────────
// Lazy-loaded on first navigate; modules expose { mount, unmount }
const MODULE_DEFS = {
  dashboard: { title: 'Dashboard',           icon: '📊', load: () => import('./dashboard.js') },
  articles:  { title: 'Articles',            icon: '📝', load: () => import('./articles.js') },
  magazines: { title: 'Magazines',           icon: '📰', load: () => import('./issues.js') },
  cdf:       { title: 'Conducteur (CDF)',    icon: '🗺', load: () => import('./cdf.js') },
  calendar:  { title: 'Calendrier',          icon: '📅', load: () => import('./calendar.js') },
  billing:   { title: 'Facturation',         icon: '💶', load: () => import('./billing.js') },
  team:      { title: 'Équipe',              icon: '👥', load: () => import('./team.js') },
  reporting:   { title: 'Reporting',           icon: '📈', load: () => import('./reporting.js') },
  echeancier: { title: 'Échéancier',          icon: '⏱',  load: () => import('./echeancier.js') },
  settings:   { title: 'Paramètres',          icon: '⚙️', load: () => import('./settings.js') },
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

// ── SEED CONFIG (idempotent) ──────────────────────────────────────────────────
// Seeds `redacteur` and `type_magazine` categories if empty/absent.
// Called once after first getConfig() so we never re-seed if data exists.
async function seedConfigIfEmpty(cfg) {
  const seeds = [];

  // Seed redacteurs from REDAC_COLOR_DEFAULT if category absent/empty
  if (!cfg.redacteur || cfg.redacteur.length === 0) {
    for (const [name, color] of Object.entries(REDAC_COLOR_DEFAULT)) {
      seeds.push(API.postConfig({ category: 'redacteur', value: name, color }));
    }
  }

  // Seed type_magazine from TYPE_MAGAZINE_DEFAULT if category absent/empty
  if (!cfg.type_magazine || cfg.type_magazine.length === 0) {
    for (const t of TYPE_MAGAZINE_DEFAULT) {
      seeds.push(API.postConfig({ category: 'type_magazine', value: t, color: null }));
    }
  }

  if (seeds.length > 0) {
    await Promise.all(seeds);
    // Reload config so State reflects the seeded values
    const freshCfg = await API.getConfig();
    State.setCfg(freshCfg);
  }
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

    // Seed config categories if needed (idempotent)
    await seedConfigIfEmpty(cfg);
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
