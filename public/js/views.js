/* PressPilot V2 — views.js
   Server-synced saved views. Used by articles, magazines, calendrier, dashboard. */

import * as API from './api.js';

let _views = {}; // { module: [{id, name, state, isDefault}] }

export async function loadViewsFromServer() {
  try {
    const rows = await API.getViews();
    _views = {};
    for (const r of rows) {
      if (!_views[r.module]) _views[r.module] = [];
      _views[r.module].push({ id: r.id, name: r.name, state: r.state, isDefault: !!r.is_default });
    }
    // One-time migration from localStorage
    const legacy = localStorage.getItem('sommaire_views_v1');
    if (legacy) {
      const old = JSON.parse(legacy);
      for (const [mod, views] of Object.entries(old)) {
        for (const v of (views || [])) {
          await API.postView({ module: mod, name: v.name, state: v.state, is_default: v.isDefault ? 1 : 0 });
        }
      }
      localStorage.removeItem('sommaire_views_v1');
      await loadViewsFromServer();
    }
  } catch { /* network error — carry on */ }
}

export function getViews(module) { return _views[module] || []; }
export function findDefaultView(module) { return getViews(module).find(v => v.isDefault) || null; }

export async function saveView(module, name, state) {
  await API.postView({ module, name, state, is_default: 0 });
  await loadViewsFromServer();
}
export async function deleteViewByName(module, name) {
  const view = getViews(module).find(v => v.name === name);
  if (view?.id) await API.deleteView(view.id);
  await loadViewsFromServer();
}
export async function toggleDefaultView(module, name) {
  const view = getViews(module).find(v => v.name === name);
  if (!view?.id) return;
  await API.patchView(view.id, { is_default: view.isDefault ? 0 : 1 });
  await loadViewsFromServer();
}

import { esc } from './helpers.js';

export function renderViewsDropdown(module, getState, applyState) {
  document.querySelectorAll(`.views-btn-wrap[data-module="${module}"]`).forEach(wrap => {
    const views = getViews(module);
    wrap.innerHTML = `<div class="views-dropdown">
      <button class="btn btn-ghost btn-sm views-toggle">${views.length ? `Vues (${views.length})` : 'Vues'} ▾</button>
      <div class="views-menu" style="display:none">
        ${views.map(v => `<div class="views-menu-item">
          <button class="views-star${v.isDefault?' views-star-on':''}" data-vn="${esc(v.name)}" title="Vue par défaut">${v.isDefault?'★':'☆'}</button>
          <span class="views-name" data-vn="${esc(v.name)}">${esc(v.name)}</span>
          <button class="views-del" data-vn="${esc(v.name)}">×</button>
        </div>`).join('')}
        ${views.length ? '<div class="views-sep"></div>' : ''}
        <button class="views-save">+ Sauvegarder la vue</button>
      </div>
    </div>`;

    const menu = wrap.querySelector('.views-menu');
    wrap.querySelector('.views-toggle').addEventListener('click', e => {
      e.stopPropagation();
      const open = menu.style.display !== 'none';
      document.querySelectorAll('.views-menu, .cal-statut-dropdown').forEach(m => m.style.display = 'none');
      menu.style.display = open ? 'none' : 'block';
    });
    wrap.querySelectorAll('.views-star').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await toggleDefaultView(module, btn.dataset.vn);
        renderViewsDropdown(module, getState, applyState);
      });
    });
    wrap.querySelectorAll('.views-name').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const view = views.find(v => v.name === btn.dataset.vn);
        if (view) { applyState(view.state); menu.style.display = 'none'; }
      });
    });
    wrap.querySelectorAll('.views-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await deleteViewByName(module, btn.dataset.vn);
        renderViewsDropdown(module, getState, applyState);
        menu.style.display = 'none';
      });
    });
    wrap.querySelector('.views-save').addEventListener('click', async e => {
      e.stopPropagation();
      const name = prompt('Nom de la vue :');
      if (!name?.trim()) return;
      await saveView(module, name.trim(), getState());
      renderViewsDropdown(module, getState, applyState);
      menu.style.display = 'none';
    });
  });
}

// Global click → close all dropdowns
document.addEventListener('click', () => {
  document.querySelectorAll('.views-menu, .cal-statut-dropdown').forEach(m => m.style.display = 'none');
});
