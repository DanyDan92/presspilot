/* PressPilot V2 — ui-shell.js
   Stats bar, toast/undo system, sidebar collapse, mobile drawer,
   topbar updates. Shared singleton — imported by all modules. */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, issueKanbanCol } from './helpers.js';

// ── STATS BAR ─────────────────────────────────────────────────────────────────
export async function loadStatsBar() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;
  const encours = State.allIssues.filter(iss => ['En cours de rédaction','Rédaction'].includes(iss.statut_numero));
  if (!encours.length) { bar.innerHTML = '<span class="stats-empty">Aucun numéro en cours de rédaction</span>'; return; }
  bar.innerHTML = encours.map((iss, i) => {
    const key = `${iss.magazine}|${iss.numero}`;
    const bi = State.articlesByKey[key] || {};
    const done = bi.done || 0;
    const prob = (bi.problem || 0) + (bi.rework || 0);
    const total = bi.total || 0;
    const restants = Math.max(0, total - done);
    const sep = i > 0 ? '<span class="stats-sep">|</span>' : '';
    return `${sep}<div class="stats-mag-pill" data-mag="${esc(iss.magazine)}" data-num="${esc(iss.numero)}">
      <span class="stats-mag-name">${esc(iss.magazine)}</span>
      <span class="stats-mag-num">N°${esc(iss.numero)}</span>
      <div class="stats-counts">
        <span class="sc-done" title="Terminés">✓${done}</span>
        <span class="sc-prog" title="Restants">→${restants}</span>
        ${prob ? `<span class="sc-prob" title="Problèmes">⚠${prob}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  bar.querySelectorAll('.stats-mag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const mag = pill.dataset.mag, num = pill.dataset.num;
      State.setCurrentMag(mag); State.setCurrentNum(num);
      import('./nav.js').then(m => m.navigate('articles'));
    });
  });
}

// ── TOAST / UNDO ──────────────────────────────────────────────────────────────
export function showToast(msg, withUndo = false) {
  const toast = document.getElementById('undo-toast');
  if (!toast) return;
  document.getElementById('undo-msg').textContent = msg;
  document.getElementById('btn-undo').style.display = withUndo ? '' : 'none';
  toast.style.display = 'flex';
  clearTimeout(State.toastTimer);
  State.setToastTimer(setTimeout(() => { toast.style.display = 'none'; }, 8000));
}

export function pushUndo(action) {
  State.pushUndoStack(action);
  const labels = {
    'edit':        'Modification enregistrée',
    'delete':      'Article supprimé',
    'bulk-delete': `${action.articles?.length} article(s) supprimé(s)`,
    'create':      `${action.ids?.length} article(s) créé(s)`,
    'bulk-edit':   `${action.ids?.length} article(s) modifié(s)`,
  };
  showToast(labels[action.type] || 'Action effectuée', true);
}

export async function doUndo() {
  const action = State.popUndoStack();
  if (!action) return;
  document.getElementById('undo-toast').style.display = 'none';
  if (action.type === 'edit') {
    await API.putArticle(action.id, { [action.field]: action.old });
  } else if (action.type === 'delete') {
    await API.postArticle(action.article);
  } else if (action.type === 'bulk-delete') {
    await Promise.all(action.articles.map(a => API.postArticle(a)));
  } else if (action.type === 'create') {
    await Promise.all(action.ids.map(id => API.deleteArticle(id)));
  } else if (action.type === 'bulk-edit') {
    await Promise.all(action.ids.map(id =>
      API.putArticle(id, { [action.field]: action.oldValues[id] ?? null })
    ));
  }
  // Reload current module
  import('./nav.js').then(m => m.reloadCurrentModule());
  showToast('Action annulée', State.undoStack.length > 0);
}

export function setupToast() {
  document.getElementById('btn-undo')?.addEventListener('click', doUndo);
  document.getElementById('btn-undo-dismiss')?.addEventListener('click', () => {
    document.getElementById('undo-toast').style.display = 'none';
    clearTimeout(State.toastTimer);
  });
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
export function setupSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const burgerBtn = document.getElementById('topbar-burger');

  // Restore collapsed state
  const collapsed = localStorage.getItem('pp_sidebar_collapsed') === '1';
  if (collapsed) sidebar?.classList.add('collapsed');

  toggleBtn?.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('pp_sidebar_collapsed', isCollapsed ? '1' : '0');
  });

  // Mobile burger
  burgerBtn?.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('visible', isOpen);
  });
  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('mobile-open');
    overlay.classList.remove('visible');
  });
}

export function setActiveNav(routeKey) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === routeKey);
  });
}

export function setTopbarTitle(title) {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = title;
}
