/* PressPilot V2 — articles.js
   Module: Articles table (sommaire).
   Exposes mount(container) / unmount() for the router.

   Features A (V2):
   1. Numéro éditable séparé de Magazine (deux cellules/colonnes distinctes)
   2. Resize colonnes (column-manager attachResizeHandles)
   3. Show/hide colonnes (bouton "Colonnes ▾" + menu checkboxes)
   4. Filtres pages (page_min / page_max → /api/articles)
   5. Modale commentaire éditable (bottom-sheet mobile)
   6. Chips de filtres actifs (retirables, bouton "Tout effacer")
   7. Toggle densité compact/confortable (persisté localStorage)
   8. Indicateur "enregistré" sur édition inline
   9. Deep-link CDF→Article (window.PP_pendingArticleFilter) */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, STATUS_OPTIONS, STATUS_CLASS, getRedacteurs } from './helpers.js';
import { renderViewsDropdown } from './views.js';
import { showToast, pushUndo } from './ui-shell.js';
import { createColumnManager } from './column-manager.js';
import { openCopyModal, openArticleDuplicate } from './copy-modal.js';

// ── COLUMN MANAGER ────────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key:'check',        label:'',               width:36,  hideable:false },
  { key:'magazine',     label:'Magazine',        width:100 },
  { key:'numero',       label:'Numéro',          width:70  },
  { key:'page_debut',   label:'Pg. début',       width:62  },
  { key:'page_fin',     label:'Pg. fin',         width:62  },
  { key:'titre',        label:'Titre / Sujet',   width:195 },
  { key:'type_contenu', label:'Type',            width:90  },
  { key:'rubrique',     label:'Rubrique',        width:140 },
  { key:'status',       label:'Statut',          width:128 },
  { key:'redacteur',    label:'Rédacteur',       width:95  },
  { key:'resume',       label:'Résumé / Angles', width:155 },
  { key:'commentaires', label:'Commentaires',    width:115 },
  { key:'article_source',label:'Source',         width:160 },
  { key:'actions',      label:'',               width:84,  hideable:false },
];
export const colManager = createColumnManager('articles', DEFAULT_COLUMNS);

let _mounted = false;
let _container = null;

// Page filter state (not in global State to avoid complexity)
let _pageMin = '';
let _pageMax = '';

// Density state
const DENSITY_KEY = 'pp_art_density';
let _density = localStorage.getItem(DENSITY_KEY) || 'comfortable';

// Comment modal article id
let _commentArticleId = null;

// ── MOUNT / UNMOUNT ───────────────────────────────────────────────────────────
export function mount(container) {
  _container = container;
  _mounted = true;
  container.innerHTML = buildHTML();
  // Expose reload hook for copy-modal.js (article duplication per-row)
  window.PP_reloadArticles = () => { if (_mounted) loadArticles(); };
  // Apply density immediately
  applyDensity();
  wireFilters();
  wireBulkToolbar();
  wireModals();
  wireColToggle();
  wireDensity();
  populateFilters();
}
export function unmount() {
  _mounted = false;
  _container = null;
  window.PP_reloadArticles = null;
}

function buildHTML() {
  const hideableCols = DEFAULT_COLUMNS.filter(c => c.hideable !== false);

  return `<div class="numeros-wrap" id="art-wrap">
    <div class="numeros-header">
      <h2 class="dash-title">Articles</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="text" id="art-search" placeholder="Rechercher..." style="width:130px" value="${esc(State.artSearch)}">
        <select id="filter-mag"><option value="">— Magazine —</option></select>
        <select id="filter-num"><option value="">— Numéro —</option></select>
        <select id="filter-status">
          <option value="">Tous les statuts</option>
          ${STATUS_OPTIONS.map(s=>`<option>${esc(s)}</option>`).join('')}
        </select>
        <select id="art-filter-redacteur">
          <option value="">Tous rédacteurs</option>
          ${getRedacteurs().map(r=>`<option>${esc(r.name)}</option>`).join('')}
        </select>
        <!-- Filtre pages -->
        <span class="page-range-wrap">
          <label for="art-page-min">Pg.</label>
          <input class="page-range-input" type="number" id="art-page-min" placeholder="min" min="1" value="${esc(_pageMin)}" title="Page minimum">
          <span>–</span>
          <input class="page-range-input" type="number" id="art-page-max" placeholder="max" min="1" value="${esc(_pageMax)}" title="Page maximum">
        </span>
        <!-- Colonnes show/hide -->
        <div class="col-toggle-btn" id="col-toggle-wrap">
          <button class="btn btn-ghost btn-sm" id="btn-col-toggle">Colonnes ▾</button>
          <div class="col-toggle-menu" id="col-toggle-menu">
            ${hideableCols.map(c => `<label class="col-toggle-item">
              <input type="checkbox" data-col-key="${c.key}"${colManager.isHidden(c.key) ? '' : ' checked'}>
              ${esc(c.label)}
            </label>`).join('')}
          </div>
        </div>
        <!-- Densité -->
        <button class="btn btn-ghost btn-sm density-btn${_density==='compact'?' active':''}" id="btn-density-compact" title="Vue compacte">Compact</button>
        <button class="btn btn-ghost btn-sm density-btn${_density==='comfortable'?' active':''}" id="btn-density-comfortable" title="Vue confortable">Confort.</button>
        <div class="views-btn-wrap" data-module="articles"></div>
        <button class="btn btn-primary btn-sm" id="btn-add">+ Article</button>
      </div>
    </div>
    <!-- Chips filtres actifs -->
    <div class="active-filters-bar" id="active-filters-bar" aria-live="polite"></div>
    <!-- BULK TOOLBAR -->
    <div id="bulk-toolbar" class="bulk-toolbar" style="display:none">
      <span id="bulk-count"></span>
      <span class="bulk-sep">|</span>
      <button class="btn btn-ghost btn-sm" id="btn-bulk-duplicate">⧉ Dupliquer</button>
      <span class="bulk-sep">|</span>
      <span class="bulk-label">Modifier :</span>
      <select id="bulk-field">
        <option value="">— Champ —</option>
        <option value="status">Statut</option>
        <option value="type_contenu">Type</option>
        <option value="rubrique">Rubrique</option>
        <option value="magazine">Magazine</option>
        <option value="numero">Numéro</option>
        <option value="redacteur">Rédacteur</option>
      </select>
      <div id="bulk-value-wrap"></div>
      <button class="btn btn-primary btn-sm" id="btn-bulk-apply">Appliquer</button>
      <span class="bulk-sep">|</span>
      <button class="btn btn-danger btn-sm" id="btn-bulk-delete">🗑 Supprimer</button>
      <button class="btn btn-ghost btn-sm" id="btn-bulk-clear">✕ Désélectionner</button>
    </div>
    <div class="table-wrap">
      <table id="main-table">
        <colgroup>
          <col data-col="check">
          <col data-col="magazine">
          <col data-col="numero">
          <col data-col="page_debut">
          <col data-col="page_fin">
          <col data-col="titre">
          <col data-col="type_contenu">
          <col data-col="rubrique">
          <col data-col="status">
          <col data-col="redacteur">
          <col data-col="resume">
          <col data-col="commentaires">
          <col data-col="article_source">
          <col data-col="actions">
        </colgroup>
        <thead>
          <tr>
            <th class="th-check col-pin" data-col="check"><input type="checkbox" id="check-all" title="Tout sélectionner"></th>
            <th data-sort="magazine"     data-col="magazine">Magazine</th>
            <th data-sort="numero"       data-col="numero">Numéro</th>
            <th data-sort="page_debut"  data-col="page_debut">Pg. début</th>
            <th data-sort="page_fin"    data-col="page_fin">Pg. fin</th>
            <th data-sort="titre"       data-col="titre">Titre / Sujet</th>
            <th data-sort="type_contenu"data-col="type_contenu">Type</th>
            <th data-sort="rubrique"    data-col="rubrique">Rubrique</th>
            <th data-sort="status"      data-col="status">Statut</th>
            <th data-sort="redacteur"   data-col="redacteur">Rédacteur</th>
            <th                         data-col="resume">Résumé / Angles</th>
            <th                         data-col="commentaires">Commentaires</th>
            <th                         data-col="article_source">Source</th>
            <th                         data-col="actions"></th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">
        Aucun article trouvé. Sélectionne un magazine et un numéro, ou ajoute un article.
      </div>
    </div>
  </div>
  <!-- Modale commentaire -->
  <div id="modal-comment" role="dialog" aria-modal="true" aria-labelledby="comment-modal-title">
    <div class="comment-modal-panel">
      <div class="comment-modal-header">
        <h3 class="comment-modal-title" id="comment-modal-title">Commentaire</h3>
        <button class="comment-modal-close" id="btn-comment-close" aria-label="Fermer">×</button>
      </div>
      <div class="comment-modal-body">
        <textarea class="comment-modal-textarea" id="comment-modal-textarea" rows="6" placeholder="Aucun commentaire"></textarea>
      </div>
      <div class="comment-modal-footer">
        <span class="save-indicator" id="comment-save-indicator" aria-live="polite">
          <span class="save-dot"></span><span class="save-label">Enregistrement…</span>
        </span>
        <button class="btn btn-ghost" id="btn-comment-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-comment-save">Enregistrer</button>
      </div>
    </div>
  </div>
  <!-- Modals inside module: bulk dup only (copy-modal autonome gère le reste) -->
  <div id="modal-bulk-dup" class="modal-overlay" style="display:none">
    <div class="modal modal-copy-inner">
      <h3>Dupliquer les articles</h3>
      <p class="modal-source">Articles sélectionnés : <strong id="bdup-count"></strong></p>
      <div class="copy-sections">
        <div class="copy-section">
          <h4>Champs à copier</h4>
          <div class="copy-checkboxes">
            <label><input type="checkbox" id="bdup-titre" checked> Titre</label>
            <label><input type="checkbox" id="bdup-pages" checked> Pages (début / fin)</label>
            <label><input type="checkbox" id="bdup-type" checked> Type de contenu</label>
            <label><input type="checkbox" id="bdup-rubrique" checked> Rubrique</label>
            <label><input type="checkbox" id="bdup-resume"> Résumé / Angles</label>
            <label><input type="checkbox" id="bdup-source"> Source (URL)</label>
            <label><input type="checkbox" id="bdup-commentaires"> Commentaires</label>
            <label><input type="checkbox" id="bdup-auteur"> Auteur</label>
            <label><input type="checkbox" id="bdup-deadline"> Deadline</label>
            <label><input type="checkbox" id="bdup-signes"> Signes</label>
          </div>
        </div>
        <div class="copy-section">
          <h4>Destination</h4>
          <label><span>Magazine</span><select id="bdup-dest-mag" style="width:100%"></select></label>
          <label><span>Numéro</span><select id="bdup-dest-num" style="width:100%"></select></label>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-bdup-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-bdup-confirm">Dupliquer</button>
      </div>
    </div>
  </div>`;
}

// ── DENSITY ───────────────────────────────────────────────────────────────────
function applyDensity() {
  const wrap = document.getElementById('art-wrap');
  if (wrap) wrap.dataset.density = _density;
  document.querySelectorAll('.density-btn').forEach(btn => {
    btn.classList.toggle('active',
      (btn.id === 'btn-density-compact' && _density === 'compact') ||
      (btn.id === 'btn-density-comfortable' && _density === 'comfortable')
    );
  });
}

function wireDensity() {
  document.getElementById('btn-density-compact')?.addEventListener('click', () => {
    _density = 'compact';
    localStorage.setItem(DENSITY_KEY, _density);
    applyDensity();
  });
  document.getElementById('btn-density-comfortable')?.addEventListener('click', () => {
    _density = 'comfortable';
    localStorage.setItem(DENSITY_KEY, _density);
    applyDensity();
  });
}

// ── COL TOGGLE (show/hide) ────────────────────────────────────────────────────
function wireColToggle() {
  const btn  = document.getElementById('btn-col-toggle');
  const menu = document.getElementById('col-toggle-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open');
  });

  menu.querySelectorAll('input[data-col-key]').forEach(cb => {
    cb.addEventListener('change', () => {
      colManager.setHidden(cb.dataset.colKey, !cb.checked);
      applyColVisibility();
    });
  });
}

function applyColVisibility() {
  const table = document.getElementById('main-table');
  if (!table) return;
  DEFAULT_COLUMNS.forEach(col => {
    const hidden = colManager.isHidden(col.key);
    // Hide colgroup col
    const colEl = table.querySelector(`col[data-col="${col.key}"]`);
    if (colEl) colEl.classList.toggle('col-hidden', hidden);
    // Hide th
    table.querySelectorAll(`th[data-col="${col.key}"]`).forEach(el => el.classList.toggle('col-hidden', hidden));
    // Hide td in each row
    table.querySelectorAll(`td[data-col="${col.key}"]`).forEach(el => el.classList.toggle('col-hidden', hidden));
  });
  // Update checkboxes to reflect current state (after applyState from view)
  const menu = document.getElementById('col-toggle-menu');
  if (menu) {
    menu.querySelectorAll('input[data-col-key]').forEach(cb => {
      cb.checked = !colManager.isHidden(cb.dataset.colKey);
    });
  }
}

// ── CHIPS ─────────────────────────────────────────────────────────────────────
function renderChips() {
  const bar = document.getElementById('active-filters-bar');
  if (!bar) return;
  const chips = [];

  const mag    = document.getElementById('filter-mag')?.value || '';
  const num    = document.getElementById('filter-num')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const redac  = document.getElementById('art-filter-redacteur')?.value || '';
  const pMin   = _pageMin;
  const pMax   = _pageMax;
  const search = State.artSearch;

  if (mag)    chips.push({ key:'mag',    label:`Mag : ${mag}`,        clear: () => { document.getElementById('filter-mag').value=''; State.setCurrentMag(''); document.getElementById('filter-num').innerHTML='<option value="">— Numéro —</option>'; State.setCurrentNum(''); loadArticles(); } });
  if (num)    chips.push({ key:'num',    label:`N° ${num}`,           clear: () => { document.getElementById('filter-num').value=''; State.setCurrentNum(''); loadArticles(); } });
  if (status) chips.push({ key:'status', label:`Statut : ${status}`,  clear: () => { document.getElementById('filter-status').value=''; loadArticles(); } });
  if (redac)  chips.push({ key:'redac',  label:`Rédac. : ${redac}`,   clear: () => { document.getElementById('art-filter-redacteur').value=''; State.setArtFilterRedacteur(''); loadArticles(); } });
  if (pMin)   chips.push({ key:'pmin',   label:`Pg. ≥ ${pMin}`,       clear: () => { _pageMin=''; const el=document.getElementById('art-page-min'); if(el)el.value=''; loadArticles(); } });
  if (pMax)   chips.push({ key:'pmax',   label:`Pg. ≤ ${pMax}`,       clear: () => { _pageMax=''; const el=document.getElementById('art-page-max'); if(el)el.value=''; loadArticles(); } });
  if (search) chips.push({ key:'search', label:`"${search}"`,          clear: () => { State.setArtSearch(''); const el=document.getElementById('art-search'); if(el)el.value=''; loadArticles(); } });
  // Deep-link chip stored in window transiently — if pendingFilter was processed, no chip needed (already highlighted)
  // We track an active deep-link chip separately
  if (window._artDeepLinkChip) chips.push({ key:'deeplink', label:`Article #${window._artDeepLinkChip}`, clear: () => { window._artDeepLinkChip = null; renderChips(); } });

  bar.innerHTML = '';
  chips.forEach(chip => {
    const el = document.createElement('span');
    el.className = 'filter-chip';
    el.innerHTML = `${esc(chip.label)}<button class="filter-chip-remove" aria-label="Retirer filtre ${esc(chip.key)}">×</button>`;
    el.querySelector('.filter-chip-remove').addEventListener('click', chip.clear);
    bar.appendChild(el);
  });

  if (chips.length >= 2) {
    const clearAll = document.createElement('button');
    clearAll.className = 'chips-clear-all';
    clearAll.textContent = 'Tout effacer';
    clearAll.addEventListener('click', () => {
      // Clear all filters
      const filterMag = document.getElementById('filter-mag');
      const filterNum = document.getElementById('filter-num');
      const filterStatus = document.getElementById('filter-status');
      const filterRedac = document.getElementById('art-filter-redacteur');
      const artSearch = document.getElementById('art-search');
      const artPageMin = document.getElementById('art-page-min');
      const artPageMax = document.getElementById('art-page-max');
      if (filterMag) filterMag.value = '';
      if (filterNum) { filterNum.innerHTML = '<option value="">— Numéro —</option>'; }
      if (filterStatus) filterStatus.value = '';
      if (filterRedac) filterRedac.value = '';
      if (artSearch) artSearch.value = '';
      if (artPageMin) artPageMin.value = '';
      if (artPageMax) artPageMax.value = '';
      State.setCurrentMag(''); State.setCurrentNum('');
      State.setArtSearch(''); State.setArtFilterRedacteur('');
      _pageMin = ''; _pageMax = '';
      window._artDeepLinkChip = null;
      loadArticles();
    });
    bar.appendChild(clearAll);
  }
}

// ── SAVE INDICATOR ────────────────────────────────────────────────────────────
function showSaveIndicator(state = 'saving', msg = '') {
  // Generic one, shown via toast for table inline edits
  // For comment modal, we use its own indicator
  if (state === 'saved') showToast(msg || 'Enregistré');
}

// ── POPULATE FILTERS ──────────────────────────────────────────────────────────
async function populateFilters() {
  const nums = await API.getNumeros();
  const mags = [...new Set(nums.map(n => n.magazine))].sort();
  const selMag = document.getElementById('filter-mag');
  if (!selMag) return;
  selMag.innerHTML = '<option value="">— Magazine —</option>' + mags.map(m => `<option${m===State.currentMag?' selected':''}>${esc(m)}</option>`).join('');
  if (State.currentMag) {
    const filtered = nums.filter(n => n.magazine === State.currentMag).map(n => n.numero);
    document.getElementById('filter-num').innerHTML = '<option value="">— Numéro —</option>' + filtered.map(n => `<option${n===State.currentNum?' selected':''}>${esc(n)}</option>`).join('');
  }
  if (State.artFilterRedacteur) {
    const el = document.getElementById('art-filter-redacteur');
    if (el) el.value = State.artFilterRedacteur;
  }
  renderViewsDropdown('articles', getArticlesState, applyArticlesState);
  loadArticles();
}

function wireFilters() {
  const get = id => document.getElementById(id);
  get('art-search')?.addEventListener('input', e => { State.setArtSearch(e.target.value.toLowerCase()); loadArticles(); });
  get('filter-mag')?.addEventListener('change', async () => {
    State.setCurrentMag(get('filter-mag').value);
    State.setCurrentNum('');
    const nums = await API.getNumeros();
    const filtered = nums.filter(n => n.magazine === State.currentMag).map(n => n.numero);
    get('filter-num').innerHTML = '<option value="">— Numéro —</option>' + filtered.map(n => `<option>${esc(n)}</option>`).join('');
    loadArticles();
  });
  get('filter-num')?.addEventListener('change', e => { State.setCurrentNum(e.target.value); loadArticles(); });
  get('filter-status')?.addEventListener('change', () => loadArticles());
  get('art-filter-redacteur')?.addEventListener('change', e => { State.setArtFilterRedacteur(e.target.value); loadArticles(); });

  // Page filters (debounce-free for simplicity; small numbers)
  get('art-page-min')?.addEventListener('change', e => { _pageMin = e.target.value.trim(); loadArticles(); });
  get('art-page-max')?.addEventListener('change', e => { _pageMax = e.target.value.trim(); loadArticles(); });
  get('art-page-min')?.addEventListener('input',  e => { _pageMin = e.target.value.trim(); });
  get('art-page-max')?.addEventListener('input',  e => { _pageMax = e.target.value.trim(); });
  get('art-page-min')?.addEventListener('keydown', e => { if (e.key === 'Enter') { _pageMin = e.target.value.trim(); loadArticles(); } });
  get('art-page-max')?.addEventListener('keydown', e => { if (e.key === 'Enter') { _pageMax = e.target.value.trim(); loadArticles(); } });

  get('btn-add')?.addEventListener('click', () => addArticle());
}

// ── LOAD / RENDER ─────────────────────────────────────────────────────────────
export async function loadArticles() {
  if (!_mounted) return;

  // ── DEEP-LINK: consume window.PP_pendingArticleFilter ──────────────────────
  const pending = window.PP_pendingArticleFilter;
  if (pending) {
    delete window.PP_pendingArticleFilter;
    // Apply magazine + numero
    if (pending.magazine) {
      State.setCurrentMag(pending.magazine);
      const selMag = document.getElementById('filter-mag');
      if (selMag) {
        // Ensure option exists
        if (![...selMag.options].find(o => o.value === pending.magazine)) {
          const opt = document.createElement('option');
          opt.value = pending.magazine;
          opt.textContent = pending.magazine;
          selMag.appendChild(opt);
        }
        selMag.value = pending.magazine;
      }
      // Refresh numero dropdown
      try {
        const nums = await API.getNumeros();
        const filtered = nums.filter(n => n.magazine === pending.magazine).map(n => n.numero);
        const selNum = document.getElementById('filter-num');
        if (selNum) {
          selNum.innerHTML = '<option value="">— Numéro —</option>' + filtered.map(n => `<option>${esc(n)}</option>`).join('');
          if (pending.numero) selNum.value = String(pending.numero);
        }
      } catch(_) {}
    }
    if (pending.numero !== undefined) State.setCurrentNum(String(pending.numero));
    // Apply page range from article
    if (pending.page_debut !== null && pending.page_debut !== undefined) {
      _pageMin = String(pending.page_debut);
      const el = document.getElementById('art-page-min');
      if (el) el.value = _pageMin;
    }
    if (pending.page_fin !== null && pending.page_fin !== undefined) {
      _pageMax = String(pending.page_fin);
      const el = document.getElementById('art-page-max');
      if (el) el.value = _pageMax;
    }
    // Store deep-link article id for chip + scroll
    if (pending.articleId) window._artDeepLinkChip = pending.articleId;
    // We'll scroll/highlight after render
    window._artDeepLinkId = pending.articleId || null;
  }

  const params = {};
  if (State.currentMag) params.magazine = State.currentMag;
  if (State.currentNum) params.numero   = State.currentNum;
  const staEl = document.getElementById('filter-status');
  if (staEl?.value) params.status = staEl.value;
  if (_pageMin) params.page_min = _pageMin;
  if (_pageMax) params.page_max = _pageMax;

  let articles = await API.getArticles(params);
  if (State.artSearch) {
    const q = State.artSearch;
    articles = articles.filter(a =>
      (a.titre||'').toLowerCase().includes(q) ||
      (a.rubrique||'').toLowerCase().includes(q) ||
      (a.type_contenu||'').toLowerCase().includes(q) ||
      (a.magazine||'').toLowerCase().includes(q)
    );
  }
  if (State.artFilterRedacteur) articles = articles.filter(a => a.redacteur === State.artFilterRedacteur);
  if (State.artSortField) {
    articles.sort((a, b) => {
      const va = a[State.artSortField] ?? 9999;
      const vb = b[State.artSortField] ?? 9999;
      return va < vb ? -State.artSortDir : va > vb ? State.artSortDir : 0;
    });
  }

  renderArticlesTable(articles);
  renderViewsDropdown('articles', getArticlesState, applyArticlesState);
  renderChips();

  // Apply column widths + visibility
  const table = document.getElementById('main-table');
  colManager.applyWidths(table);
  const thead = table?.querySelector('thead');
  colManager.attachResizeHandles(thead, () => colManager.applyWidths(table));
  applyColVisibility();

  // Deep-link: scroll + highlight
  if (window._artDeepLinkId) {
    const targetId = window._artDeepLinkId;
    window._artDeepLinkId = null;
    // Use setTimeout to let DOM paint
    setTimeout(() => {
      const row = document.querySelector(`tr[data-id="${targetId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('deeplink-highlight');
        setTimeout(() => row.classList.remove('deeplink-highlight'), 3000);
      }
    }, 100);
  }
}

function renderArticlesTable(articles) {
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  if (!tbody) return;
  State.selectedIds.clear(); updateBulkToolbar();
  if (!articles.length) { tbody.innerHTML = ''; if(empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';

  // Liste des magazines existants pour le menu déroulant de la colonne Magazine
  const magBase = [...new Set((State.allIssues||[]).map(i => i.magazine).filter(Boolean))];

  tbody.innerHTML = articles.map(a => {
    const staOpts = STATUS_OPTIONS.map(s => `<option${s===a.status?' selected':''}>${s}</option>`).join('');
    const staClass = STATUS_CLASS[a.status] || 's-todo';
    // Options magazine : magasins connus + valeur courante si absente de la liste
    const magList = [...magBase];
    if (a.magazine && !magList.includes(a.magazine)) magList.push(a.magazine);
    magList.sort();
    const magSel = `<option value=""></option>` + magList.map(m => `<option${m===a.magazine?' selected':''}>${esc(m)}</option>`).join('');
    const typeSel = `<option value=""></option>` + (State.cfg.type_contenu||[]).map(c => `<option${c.value===a.type_contenu?' selected':''}>${esc(c.value)}</option>`).join('');
    const rubSel  = `<option value=""></option>` + (State.cfg.rubrique||[]).map(c => `<option${c.value===a.rubrique?' selected':''}>${esc(c.value)}</option>`).join('');
    // Commentaire tronqué
    const commentTrunc = a.commentaires ? esc(a.commentaires) : '';
    return `<tr data-id="${a.id}">
      <td class="td-check col-pin" data-col="check"><input type="checkbox" class="row-check" data-id="${a.id}"></td>
      <td class="td-mag" data-col="magazine"><div class="mag-cell">
        <span class="mag-goto" data-mag="${esc(a.magazine)}" data-num="${esc(a.numero)}" title="Voir ce magazine dans le module Magazines" role="button" tabindex="0" aria-label="Aller au magazine ${esc(a.magazine)}">↗</span>
        <select class="cell-select mag-select" data-field="magazine" data-id="${a.id}">${magSel}</select>
      </div></td>
      <td class="td-num" data-col="numero"><span class="editable" contenteditable="true" data-field="numero" data-id="${a.id}">${esc(a.numero)}</span></td>
      <td data-col="page_debut"><span class="editable" contenteditable="true" data-field="page_debut" data-id="${a.id}">${esc(a.page_debut??'')}</span></td>
      <td data-col="page_fin"><span class="editable" contenteditable="true" data-field="page_fin"   data-id="${a.id}">${esc(a.page_fin??'')}</span></td>
      <td data-col="titre"><span class="editable" contenteditable="true" data-field="titre"      data-id="${a.id}">${esc(a.titre)}</span></td>
      <td data-col="type_contenu"><select class="cell-select" data-field="type_contenu" data-id="${a.id}">${typeSel}</select></td>
      <td data-col="rubrique"><select class="cell-select" data-field="rubrique"     data-id="${a.id}">${rubSel}</select></td>
      <td data-col="status"><select class="status-select ${staClass}" data-field="status" data-id="${a.id}">${staOpts}</select></td>
      <td data-col="redacteur"><select class="cell-select redac-select" data-field="redacteur" data-id="${a.id}">
        <option value="">—</option>
        ${getRedacteurs().map(r => `<option${r.name===a.redacteur?' selected':''}>${esc(r.name)}</option>`).join('')}
      </select></td>
      <td class="td-wrap" data-col="resume"><span class="editable editable-wrap" contenteditable="true" data-field="resume"       data-id="${a.id}">${esc(a.resume??'')}</span></td>
      <td class="td-comment-cell" data-col="commentaires">
        <span class="comment-truncated" data-comment-id="${a.id}" title="${commentTrunc}" role="button" tabindex="0" aria-label="Modifier commentaire">${commentTrunc}</span>
      </td>
      <td class="col-source-cell" data-col="article_source">${renderSourceCell(a)}</td>
      <td data-col="actions"><div class="actions"><button class="btn-icon" data-add-below="${a.id}" title="Ajouter un article dessous">＋</button><button class="btn-icon" data-dup-art="${a.id}" title="Dupliquer">⧉</button><button class="btn-icon" data-del="${a.id}" title="Supprimer">🗑</button></div></td>
    </tr>`;
  }).join('');

  // Sort headers
  document.querySelectorAll('thead th[data-sort]').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.sort === State.artSortField) th.classList.add(State.artSortDir===1?'sorted-asc':'sorted-desc');
    th.onclick = () => {
      if (State.artSortField === th.dataset.sort) State.setArtSortDir(State.artSortDir * -1);
      else { State.setArtSortField(th.dataset.sort); State.setArtSortDir(1); }
      loadArticles();
    };
  });

  articles.forEach(a => { State.articlesCache[a.id] = { ...a }; });

  // Inline edit: contenteditable fields
  tbody.querySelectorAll('.editable').forEach(el => {
    el.addEventListener('focus', () => { el.dataset.before = el.textContent.trim(); });
    el.addEventListener('blur', () => patchArticle(Number(el.dataset.id), el.dataset.field, el.textContent.trim(), el.dataset.before));
    el.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); el.blur(); } });
  });
  tbody.querySelectorAll('.cell-select').forEach(sel => {
    sel.addEventListener('focus', () => { sel.dataset.before = sel.value; });
    sel.addEventListener('change', () => patchArticle(Number(sel.dataset.id), sel.dataset.field, sel.value, sel.dataset.before));
  });
  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('focus', () => { sel.dataset.before = sel.value; });
    sel.addEventListener('change', () => {
      sel.className = 'status-select ' + (STATUS_CLASS[sel.value] || 's-todo');
      patchArticle(Number(sel.dataset.id), 'status', sel.value, sel.dataset.before);
    });
  });
  tbody.querySelectorAll('[data-add-below]').forEach(btn => {
    btn.addEventListener('click', () => insertArticleBelow(Number(btn.dataset.addBelow)));
  });
  tbody.querySelectorAll('.mag-goto').forEach(el => {
    const go = () => gotoMagazine(el.dataset.mag, el.dataset.num);
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  tbody.querySelectorAll('[data-dup-art]').forEach(btn => {
    btn.addEventListener('click', () => openArticleDuplicate(Number(btn.dataset.dupArt)));
  });
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.del);
      if (!confirm('Supprimer cet article ?')) return;
      const article = State.articlesCache[id];
      await API.deleteArticle(id);
      if (article) pushUndo({ type:'delete', article });
      else showToast('Article supprimé');
      loadArticles();
    });
  });
  tbody.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) State.selectedIds.add(Number(cb.dataset.id));
      else State.selectedIds.delete(Number(cb.dataset.id));
      const checkAll = document.getElementById('check-all');
      if (checkAll) checkAll.checked = State.selectedIds.size === articles.length;
      updateBulkToolbar();
    });
  });
  const checkAll = document.getElementById('check-all');
  if (checkAll) checkAll.onchange = function() {
    tbody.querySelectorAll('.row-check').forEach(cb => {
      cb.checked = this.checked;
      if (this.checked) State.selectedIds.add(Number(cb.dataset.id));
      else State.selectedIds.delete(Number(cb.dataset.id));
    });
    updateBulkToolbar();
  };

  // Comment truncated cells → open modal
  tbody.querySelectorAll('.comment-truncated').forEach(el => {
    const openModal = () => openCommentModal(Number(el.dataset.commentId));
    el.addEventListener('click', openModal);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } });
  });

  setupSourceCells(tbody);
}

function renderSourceCell(a) {
  const val = esc(a.article_source ?? '');
  const vis = a.article_source ? '' : 'visibility:hidden';
  return `<span class="source-cell-wrap">
    <a class="source-open" href="${val}" target="_blank" rel="noopener" tabindex="-1" style="${vis}" title="Ouvrir la source">🔗</a>
    <input class="source-input" type="url" data-field="article_source" data-id="${a.id}" value="${val}" placeholder="https://...">
  </span>`;
}
function setupSourceCells(container) {
  container.querySelectorAll('.source-input').forEach(inp => {
    inp.addEventListener('focus', () => { inp.dataset.before = inp.value; });
    inp.addEventListener('blur', () => {
      const url = inp.value.trim();
      patchArticle(Number(inp.dataset.id), 'article_source', url, inp.dataset.before);
      const lnk = inp.closest('.source-cell-wrap')?.querySelector('.source-open');
      if (lnk) { lnk.href = url || '#'; lnk.style.visibility = url ? '' : 'hidden'; }
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
}

async function patchArticle(id, field, value, oldValue) {
  // Show saving indicator via toast only for meaningful changes
  if (oldValue !== undefined && oldValue === value) return; // no change
  await API.putArticle(id, { [field]: value || null });
  if (oldValue !== undefined && oldValue !== value) {
    pushUndo({ type:'edit', id, field, old: oldValue || null });
  }
}

async function addArticle() {
  if (!State.currentMag) { alert('Sélectionne un magazine et un numéro.'); return; }
  await API.postArticle({ magazine: State.currentMag, numero: State.currentNum||'', titre:'Nouvel article', status:'Not started' });
  loadArticles();
}

// Insère un nouvel article juste sous la ligne cliquée : mêmes magazine,
// numéro et rédacteur, pages suivant celles de la ligne, statut Not started.
async function insertArticleBelow(id) {
  const a = State.articlesCache[id];
  if (!a) return;
  const base = (a.page_fin !== null && a.page_fin !== undefined && a.page_fin !== '')
    ? Number(a.page_fin)
    : (a.page_debut !== null && a.page_debut !== undefined && a.page_debut !== '')
      ? Number(a.page_debut)
      : null;
  const nextPage = (base !== null && !isNaN(base)) ? base + 1 : null;
  await API.postArticle({
    magazine: a.magazine || '',
    numero: a.numero || '',
    redacteur: a.redacteur || null,
    titre: 'Nouvel article',
    status: 'Not started',
    page_debut: nextPage,
    page_fin: null,
  });
  loadArticles();
}

// Va vers le module Magazines, filtré sur ce magazine et positionné sur le
// numéro cliqué (icône go-to).
function gotoMagazine(mag, num) {
  if (!mag) return;
  window.PP_pendingMagazineFilter = { magazine: mag, numero: num || '' };
  import('./nav.js').then(m => m.navigate('magazines'));
}

// ── COMMENT MODAL ─────────────────────────────────────────────────────────────
function openCommentModal(articleId) {
  _commentArticleId = articleId;
  const article = State.articlesCache[articleId];
  const textarea = document.getElementById('comment-modal-textarea');
  if (textarea) textarea.value = article?.commentaires || '';
  // Reset indicator
  const indicator = document.getElementById('comment-save-indicator');
  if (indicator) { indicator.className = 'save-indicator'; }
  const modal = document.getElementById('modal-comment');
  if (modal) modal.classList.add('open');
  // Focus textarea
  setTimeout(() => textarea?.focus(), 50);
}

function closeCommentModal() {
  const modal = document.getElementById('modal-comment');
  if (modal) modal.classList.remove('open');
  _commentArticleId = null;
}

async function saveComment() {
  if (_commentArticleId === null) return;
  const textarea = document.getElementById('comment-modal-textarea');
  const value = textarea?.value || '';
  const indicator = document.getElementById('comment-save-indicator');
  // Show saving state
  if (indicator) {
    indicator.className = 'save-indicator saving';
    indicator.querySelector('.save-label').textContent = 'Enregistrement…';
  }
  try {
    const oldValue = State.articlesCache[_commentArticleId]?.commentaires || '';
    await API.putArticle(_commentArticleId, { commentaires: value || null });
    // Update cache
    if (State.articlesCache[_commentArticleId]) {
      State.articlesCache[_commentArticleId].commentaires = value || null;
    }
    if (indicator) {
      indicator.className = 'save-indicator saved';
      indicator.querySelector('.save-label').textContent = 'Enregistré';
      setTimeout(() => { if (indicator) indicator.className = 'save-indicator'; }, 2000);
    }
    if (oldValue !== value) {
      pushUndo({ type:'edit', id: _commentArticleId, field: 'commentaires', old: oldValue || null });
    }
    // Update truncated cell in DOM without full reload
    const cell = document.querySelector(`.comment-truncated[data-comment-id="${_commentArticleId}"]`);
    if (cell) {
      cell.textContent = value;
      cell.title = value;
    }
    // Close after short delay to show "saved"
    setTimeout(() => closeCommentModal(), 800);
  } catch(err) {
    if (indicator) {
      indicator.className = 'save-indicator error';
      indicator.querySelector('.save-label').textContent = 'Erreur !';
    }
  }
}

// ── BULK TOOLBAR ──────────────────────────────────────────────────────────────
function wireBulkToolbar() {
  const fieldSel = document.getElementById('bulk-field');
  fieldSel?.addEventListener('change', () => {
    const wrap = document.getElementById('bulk-value-wrap');
    const field = fieldSel.value;
    if (!field) { if(wrap) wrap.innerHTML=''; return; }
    if (field==='status') {
      wrap.innerHTML = `<select id="bulk-value">${STATUS_OPTIONS.map(s=>`<option>${s}</option>`).join('')}</select>`;
    } else if (field==='type_contenu') {
      wrap.innerHTML = `<select id="bulk-value"><option value=""></option>${(State.cfg.type_contenu||[]).map(c=>`<option>${esc(c.value)}</option>`).join('')}</select>`;
    } else if (field==='rubrique') {
      wrap.innerHTML = `<select id="bulk-value"><option value=""></option>${(State.cfg.rubrique||[]).map(c=>`<option>${esc(c.value)}</option>`).join('')}</select>`;
    } else if (field==='magazine') {
      const mags = [...new Set(State.allIssues.map(i=>i.magazine))].sort();
      wrap.innerHTML = `<select id="bulk-value"><option value=""></option>${mags.map(m=>`<option>${esc(m)}</option>`).join('')}</select>`;
    } else if (field==='numero') {
      wrap.innerHTML = `<input id="bulk-value" type="text" style="width:110px" placeholder="N° magazine">`;
    } else if (field==='redacteur') {
      wrap.innerHTML = `<select id="bulk-value"><option value="">— Aucun —</option>${getRedacteurs().map(r=>`<option>${esc(r.name)}</option>`).join('')}</select>`;
    } else {
      wrap.innerHTML = `<input id="bulk-value" type="text" style="width:140px" placeholder="Nouvelle valeur">`;
    }
  });
  document.getElementById('btn-bulk-apply')?.addEventListener('click', async () => {
    const field = fieldSel.value;
    const valEl = document.getElementById('bulk-value');
    if (!field || !valEl || !State.selectedIds.size) return;
    const ids = [...State.selectedIds];
    const oldValues = {};
    ids.forEach(id => { if (State.articlesCache[id]) oldValues[id] = State.articlesCache[id][field] ?? null; });
    await API.bulkPatch({ ids, updates:{ [field]: valEl.value } });
    pushUndo({ type:'bulk-edit', ids, field, oldValues });
    loadArticles();
  });
  document.getElementById('btn-bulk-duplicate')?.addEventListener('click', () => {
    if (!State.selectedIds.size) return;
    openBulkDupModal();
  });
  document.getElementById('btn-bulk-delete')?.addEventListener('click', async () => {
    if (!State.selectedIds.size) return;
    if (!confirm(`Supprimer ${State.selectedIds.size} article(s) ?`)) return;
    const articles = [...State.selectedIds].map(id => State.articlesCache[id]).filter(Boolean);
    await Promise.all([...State.selectedIds].map(id => API.deleteArticle(id)));
    if (articles.length) pushUndo({ type:'bulk-delete', articles });
    else showToast(`${State.selectedIds.size} article(s) supprimé(s)`);
    loadArticles();
  });
  document.getElementById('btn-bulk-clear')?.addEventListener('click', () => {
    State.selectedIds.clear();
    document.querySelectorAll('.row-check').forEach(cb => cb.checked = false);
    const ca = document.getElementById('check-all'); if(ca) ca.checked = false;
    updateBulkToolbar();
  });
}

function updateBulkToolbar() {
  const bar = document.getElementById('bulk-toolbar');
  const cnt = document.getElementById('bulk-count');
  if (!bar) return;
  if (!State.selectedIds.size) { bar.style.display='none'; return; }
  bar.style.display = 'flex';
  if(cnt) cnt.innerHTML = `<strong>${State.selectedIds.size}</strong> sélectionné(s)`;
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function wireModals() {
  // Comment modal
  document.getElementById('btn-comment-close')?.addEventListener('click', closeCommentModal);
  document.getElementById('btn-comment-cancel')?.addEventListener('click', closeCommentModal);
  document.getElementById('btn-comment-save')?.addEventListener('click', saveComment);
  document.getElementById('modal-comment')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCommentModal();
  });
  // Keyboard: Escape closes, Ctrl+Enter saves
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('modal-comment');
    if (!modal?.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeCommentModal(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveComment(); }
  });

  // Bulk dup modal
  document.getElementById('bdup-dest-mag')?.addEventListener('change', updateBdupNums);
  document.getElementById('btn-bdup-cancel')?.addEventListener('click', () => { document.getElementById('modal-bulk-dup').style.display='none'; });
  document.getElementById('modal-bulk-dup')?.addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
  document.getElementById('btn-bdup-confirm')?.addEventListener('click', async () => {
    const destMag = document.getElementById('bdup-dest-mag').value;
    const destNum = document.getElementById('bdup-dest-num').value;
    const fields = [];
    if (document.getElementById('bdup-titre').checked)        fields.push('titre');
    if (document.getElementById('bdup-pages').checked)        { fields.push('page_debut','page_fin'); }
    if (document.getElementById('bdup-type').checked)         fields.push('type_contenu');
    if (document.getElementById('bdup-rubrique').checked)     fields.push('rubrique');
    if (document.getElementById('bdup-resume').checked)       fields.push('resume');
    if (document.getElementById('bdup-source').checked)       fields.push('article_source');
    if (document.getElementById('bdup-commentaires').checked) fields.push('commentaires');
    if (document.getElementById('bdup-auteur').checked)       fields.push('auteur');
    if (document.getElementById('bdup-deadline').checked)     fields.push('deadline');
    if (document.getElementById('bdup-signes').checked)       fields.push('signes');
    const r = await fetch('/api/articles/duplicate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ids:[...State.selectedIds], fields, dest_magazine:destMag, dest_numero:destNum })
    });
    const result = await r.json();
    document.getElementById('modal-bulk-dup').style.display='none';
    if (r.ok && result.newIds?.length) pushUndo({ type:'create', ids: result.newIds });
    else if (r.ok) showToast(`${result.duplicated} article(s) dupliqué(s)`);
    loadArticles();
  });
}

function openBulkDupModal() {
  const cnt = document.getElementById('bdup-count');
  if(cnt) cnt.textContent = State.selectedIds.size;
  const mags = [...new Set(State.allIssues.map(i => i.magazine))].sort();
  const magSel = document.getElementById('bdup-dest-mag');
  if(magSel) {
    magSel.innerHTML = mags.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    if (State.currentMag && mags.includes(State.currentMag)) magSel.value = State.currentMag;
  }
  updateBdupNums();
  document.getElementById('modal-bulk-dup').style.display = 'flex';
}
function updateBdupNums() {
  const mag = document.getElementById('bdup-dest-mag')?.value;
  const nums = State.allIssues.filter(i => i.magazine === mag).map(i => i.numero);
  const numSel = document.getElementById('bdup-dest-num');
  if(numSel) {
    numSel.innerHTML = nums.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (State.currentNum && nums.includes(State.currentNum)) numSel.value = State.currentNum;
  }
}

// ── STATE FOR VIEWS ───────────────────────────────────────────────────────────
export function getArticlesState() {
  const statusEl = document.getElementById('filter-status');
  return {
    mag: State.currentMag,
    num: State.currentNum,
    status: statusEl?.value || '',
    search: State.artSearch,
    redacteur: State.artFilterRedacteur,
    sortField: State.artSortField,
    sortDir: State.artSortDir,
    pageMin: _pageMin,
    pageMax: _pageMax,
    density: _density,
    ...colManager.getState(),
  };
}
export function applyArticlesState(state) {
  if (!state) return;
  if (state.mag !== undefined) {
    State.setCurrentMag(state.mag);
    const el = document.getElementById('filter-mag');
    if(el) el.value = state.mag;
  }
  if (state.num !== undefined) {
    State.setCurrentNum(state.num);
    const el = document.getElementById('filter-num');
    if (el) el.innerHTML = `<option value="">— Numéro —</option>${state.num ? `<option selected>${esc(state.num)}</option>` : ''}`;
  }
  if (state.status !== undefined) { const el = document.getElementById('filter-status'); if(el) el.value = state.status; }
  if (state.search !== undefined) { State.setArtSearch(state.search); const el = document.getElementById('art-search'); if(el) el.value = state.search; }
  if (state.redacteur !== undefined) { State.setArtFilterRedacteur(state.redacteur); const el = document.getElementById('art-filter-redacteur'); if(el) el.value = state.redacteur; }
  if (state.sortField) { State.setArtSortField(state.sortField); State.setArtSortDir(state.sortDir || 1); }
  if (state.pageMin !== undefined) { _pageMin = state.pageMin; const el=document.getElementById('art-page-min'); if(el) el.value = _pageMin; }
  if (state.pageMax !== undefined) { _pageMax = state.pageMax; const el=document.getElementById('art-page-max'); if(el) el.value = _pageMax; }
  if (state.density) { _density = state.density; localStorage.setItem(DENSITY_KEY, _density); applyDensity(); }
  if (state.columns) colManager.applyState(state.columns);
  loadArticles();
}
