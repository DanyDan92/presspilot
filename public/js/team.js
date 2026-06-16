/* PressPilot V2 — team.js
   Module: Équipe / Rédacteurs.
   Exposes mount(container) / unmount().

   Features:
   - Cartes rédacteur avec header coloré, initiales, charge de travail
   - CRUD rédacteur : ajout, renommer inline, couleur, suppression
   - Section types de magazine éditables
   - Config-driven via catégorie `redacteur` et `type_magazine` */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, getRedacteurs, getTypeMagazine, TYPE_MAGAZINE_DEFAULT } from './helpers.js';

let _mounted = false;

// ── MOUNT / UNMOUNT ───────────────────────────────────────────────────────────
export function mount(container) {
  _mounted = true;
  container.innerHTML = buildHTML();
  render();
}
export function unmount() {
  _mounted = false;
}

// ── BUILD SHELL ───────────────────────────────────────────────────────────────
function buildHTML() {
  return `<div class="team-wrap">
    <div class="team-page-header">
      <div>
        <p class="team-eyebrow">Configuration</p>
        <h2 class="team-title">Équipe éditoriale</h2>
        <p class="team-subtitle">Gère les rédacteurs et leur charge de travail.</p>
      </div>
      <button class="btn btn-primary" id="btn-add-redacteur">+ Rédacteur</button>
    </div>

    <!-- Section rédacteurs -->
    <section class="team-section">
      <h3 class="team-section-label">Rédacteurs</h3>
      <div class="team-grid" id="team-redacteurs-grid"></div>
    </section>

    <!-- Section types de magazine -->
    <section class="team-section team-section-types">
      <div class="team-section-head">
        <h3 class="team-section-label">Types de magazine</h3>
        <button class="btn btn-ghost btn-sm" id="btn-add-type">+ Type</button>
      </div>
      <div class="team-types-list" id="team-types-list"></div>
    </section>

    <!-- Modal ajout rédacteur -->
    <div id="modal-add-redac" class="modal-overlay" style="display:none">
      <div class="modal" style="width:360px">
        <h3 style="font-family:var(--font-serif);font-size:var(--text-xl);margin-bottom:var(--space-4)">Nouveau rédacteur</h3>
        <div style="display:flex;flex-direction:column;gap:var(--space-3)">
          <label>
            <span class="field-label">Nom</span>
            <input id="new-redac-name" type="text" placeholder="Prénom Nom" style="width:100%">
          </label>
          <label>
            <span class="field-label">Couleur</span>
            <div style="display:flex;align-items:center;gap:var(--space-3);margin-top:var(--space-1)">
              <input id="new-redac-color" type="color" value="#9A5F25" style="width:48px;height:36px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer">
              <span id="new-redac-color-label" style="font-size:var(--text-sm);color:var(--text-muted)">#9A5F25</span>
            </div>
          </label>
        </div>
        <div class="modal-actions" style="margin-top:var(--space-5)">
          <button class="btn btn-ghost" id="btn-add-redac-cancel">Annuler</button>
          <button class="btn btn-primary" id="btn-add-redac-confirm">Ajouter</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  if (!_mounted) return;
  renderRedacteurs();
  renderTypes();
  wireActions();
}

function renderRedacteurs() {
  const grid = document.getElementById('team-redacteurs-grid');
  if (!grid) return;

  const redacs = getRedacteurs();
  const issues = State.allIssues || [];
  const byKey  = State.articlesByKey || {};

  if (!redacs.length) {
    grid.innerHTML = `<div class="team-empty">Aucun rédacteur configuré. Clique sur "+ Rédacteur" pour en ajouter.</div>`;
    return;
  }

  grid.innerHTML = redacs.map(r => buildRedacteurCard(r, issues, byKey)).join('');

  // Wire rename inline
  grid.querySelectorAll('.team-card-name[contenteditable]').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    el.addEventListener('blur', async () => {
      const newName = el.textContent.trim();
      const oldName = el.dataset.name;
      const id      = Number(el.dataset.id);
      if (!newName || newName === oldName || !id) {
        el.textContent = oldName; // revert
        return;
      }
      await API.putConfig(id, { value: newName, color: el.closest('.team-card').dataset.color });
      const freshCfg = await API.getConfig();
      State.setCfg(freshCfg);
      renderRedacteurs();
    });
  });

  // Wire color input
  grid.querySelectorAll('.team-card-color-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const id    = Number(inp.dataset.id);
      const name  = inp.dataset.name;
      const color = inp.value;
      if (!id) return;
      await API.putConfig(id, { value: name, color });
      const freshCfg = await API.getConfig();
      State.setCfg(freshCfg);
      renderRedacteurs();
    });
  });

  // Wire delete
  grid.querySelectorAll('.team-card-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = Number(btn.dataset.id);
      const name = btn.dataset.name;
      if (!id) return;
      if (!confirm(`Supprimer le rédacteur "${name}" de la configuration ?\n(Les articles existants ne sont pas modifiés.)`)) return;
      await API.deleteConfig(id);
      const freshCfg = await API.getConfig();
      State.setCfg(freshCfg);
      renderRedacteurs();
    });
  });
}

function buildRedacteurCard(redac, issues, byKey) {
  const { name, color, id } = redac;
  const safeColor = color || '#888888';

  // Initiales (max 2 lettres)
  const initials = name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  // Charge de travail : numéros assignés à ce rédacteur
  const myIssues = issues.filter(i => i.redacteur === name);
  const issueEnCours = myIssues.filter(i => {
    const s = i.statut_numero || '';
    return ['En cours de rédaction', 'Rédaction', 'En préparation'].includes(s);
  });
  const issueTotal = myIssues.length;

  // Articles : agréger depuis articlesByKey
  let artTotal = 0, artDone = 0, artProb = 0;
  for (const iss of myIssues) {
    const key = `${iss.magazine}|${iss.numero}`;
    const bi  = byKey[key];
    if (bi) {
      artTotal += bi.total  || 0;
      artDone  += bi.done   || 0;
      artProb  += (bi.problem || 0) + (bi.rework || 0);
    }
  }
  const artRestants = Math.max(0, artTotal - artDone);
  const artPct      = artTotal ? Math.round(artDone / artTotal * 100) : 0;

  // Numéros en cours : noms des magazines (max 3)
  const enCoursLabels = issueEnCours.slice(0, 3).map(i => `${esc(i.magazine)} N°${esc(i.numero)}`);
  const enCoursMore   = issueEnCours.length > 3 ? `+${issueEnCours.length - 3}` : '';

  return `<article class="team-card" data-color="${esc(safeColor)}" style="--card-color:${esc(safeColor)}">
    <div class="team-card-header">
      <div class="team-card-avatar">${esc(initials)}</div>
      <div class="team-card-controls">
        <label class="team-card-color-btn" title="Changer la couleur">
          <input class="team-card-color-input" type="color" value="${esc(safeColor)}" data-id="${id || ''}" data-name="${esc(name)}">
          <svg class="team-color-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.5 1.5L14.5 5.5L5.5 14.5H1.5V10.5L10.5 1.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M8 4L12 8" stroke="currentColor" stroke-width="1.4"/>
          </svg>
        </label>
        ${id ? `<button class="team-card-delete btn-icon" data-id="${id}" data-name="${esc(name)}" title="Supprimer">✕</button>` : ''}
      </div>
    </div>

    <div class="team-card-body">
      <span class="team-card-name" contenteditable="${id ? 'true' : 'false'}" data-name="${esc(name)}" data-id="${id || ''}">${esc(name)}</span>

      <!-- Métriques -->
      <div class="team-metrics">
        <div class="team-kpi-row">
          <div class="team-kpi">
            <span class="team-kpi-val">${issueTotal}</span>
            <span class="team-kpi-label">Numéros</span>
          </div>
          <div class="team-kpi ${issueEnCours.length > 0 ? 'kpi-active' : ''}">
            <span class="team-kpi-val">${issueEnCours.length}</span>
            <span class="team-kpi-label">En cours</span>
          </div>
          <div class="team-kpi">
            <span class="team-kpi-val">${artTotal}</span>
            <span class="team-kpi-label">Articles</span>
          </div>
          <div class="team-kpi ${artRestants > 0 ? 'kpi-warn' : artTotal > 0 ? 'kpi-ok' : ''}">
            <span class="team-kpi-val">${artRestants}</span>
            <span class="team-kpi-label">Restants</span>
          </div>
        </div>

        ${artTotal > 0 ? `
        <div class="team-progress-wrap">
          <div class="team-progress-track">
            <div class="team-progress-fill" style="width:${artPct}%;background:${esc(safeColor)}"></div>
          </div>
          <span class="team-progress-pct">${artPct}%</span>
        </div>
        ${artProb > 0 ? `<div class="team-metric-prob"><span class="team-prob-dot">⚠</span> ${artProb} problème${artProb > 1 ? 's' : ''}</div>` : ''}
        ` : `<div class="team-metric-zero">Aucun article assigné</div>`}

        ${enCoursLabels.length > 0 ? `
        <div class="team-encours-list">
          ${enCoursLabels.map(l => `<div class="team-encours-item">${l}</div>`).join('')}
          ${enCoursMore ? `<div class="team-encours-more">${enCoursMore} autres</div>` : ''}
        </div>` : ''}
      </div>
    </div>
  </article>`;
}

function renderTypes() {
  const list = document.getElementById('team-types-list');
  if (!list) return;

  const cfgTypes = (State.cfg && State.cfg.type_magazine) || [];

  if (!cfgTypes.length) {
    list.innerHTML = `<div class="team-empty">Aucun type configuré.</div>`;
    return;
  }

  list.innerHTML = `<div class="team-tags">` +
    cfgTypes.map(t => `
      <div class="team-tag" data-id="${t.id}">
        <span class="team-tag-label" contenteditable="true" data-id="${t.id}" data-value="${esc(t.value)}">${esc(t.value)}</span>
        <button class="team-tag-delete btn-icon" data-id="${t.id}" title="Supprimer">✕</button>
      </div>
    `).join('') +
    `</div>`;

  // Wire rename
  list.querySelectorAll('.team-tag-label[contenteditable]').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    el.addEventListener('blur', async () => {
      const newVal = el.textContent.trim();
      const oldVal = el.dataset.value;
      const id     = Number(el.dataset.id);
      if (!newVal || newVal === oldVal || !id) { el.textContent = oldVal; return; }
      await API.putConfig(id, { value: newVal, color: null });
      const freshCfg = await API.getConfig();
      State.setCfg(freshCfg);
      renderTypes();
    });
  });

  // Wire delete
  list.querySelectorAll('.team-tag-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (!id || !confirm('Supprimer ce type de magazine ?')) return;
      await API.deleteConfig(id);
      const freshCfg = await API.getConfig();
      State.setCfg(freshCfg);
      renderTypes();
    });
  });
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────
function wireActions() {
  // Add redacteur → open modal
  document.getElementById('btn-add-redacteur')?.addEventListener('click', () => {
    document.getElementById('new-redac-name').value = '';
    document.getElementById('new-redac-color').value = '#9A5F25';
    document.getElementById('new-redac-color-label').textContent = '#9A5F25';
    document.getElementById('modal-add-redac').style.display = 'flex';
    setTimeout(() => document.getElementById('new-redac-name')?.focus(), 50);
  });

  document.getElementById('new-redac-color')?.addEventListener('input', e => {
    document.getElementById('new-redac-color-label').textContent = e.target.value;
  });

  document.getElementById('btn-add-redac-cancel')?.addEventListener('click', () => {
    document.getElementById('modal-add-redac').style.display = 'none';
  });
  document.getElementById('modal-add-redac')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  document.getElementById('btn-add-redac-confirm')?.addEventListener('click', async () => {
    const name  = document.getElementById('new-redac-name').value.trim();
    const color = document.getElementById('new-redac-color').value;
    if (!name) { document.getElementById('new-redac-name').focus(); return; }
    await API.postConfig({ category: 'redacteur', value: name, color });
    const freshCfg = await API.getConfig();
    State.setCfg(freshCfg);
    document.getElementById('modal-add-redac').style.display = 'none';
    renderRedacteurs();
  });

  // Enter in modal name field confirms
  document.getElementById('new-redac-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-add-redac-confirm')?.click();
  });

  // Add type
  document.getElementById('btn-add-type')?.addEventListener('click', async () => {
    const val = prompt('Nouveau type de magazine :');
    if (!val?.trim()) return;
    await API.postConfig({ category: 'type_magazine', value: val.trim(), color: null });
    const freshCfg = await API.getConfig();
    State.setCfg(freshCfg);
    renderTypes();
  });
}
