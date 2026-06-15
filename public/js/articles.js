/* PressPilot V2 — articles.js
   Module: Articles table (sommaire).
   Exposes mount(container) / unmount() for the router. */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, STATUS_OPTIONS, STATUS_CLASS, REDAC_COLOR } from './helpers.js';
import { renderViewsDropdown } from './views.js';
import { showToast, pushUndo } from './ui-shell.js';
import { createColumnManager } from './column-manager.js';
import { navigate } from './nav.js';

// ── COLUMN MANAGER ────────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key:'check',        label:'',               width:36,  hideable:false },
  { key:'magazine',     label:'Magazine',        width:100 },
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
  { key:'actions',      label:'',               width:60,  hideable:false },
];
export const colManager = createColumnManager('articles', DEFAULT_COLUMNS);

let _mounted = false;
let _container = null;

// ── MOUNT / UNMOUNT ───────────────────────────────────────────────────────────
export function mount(container) {
  _container = container;
  _mounted = true;
  container.innerHTML = buildHTML();
  wireFilters();
  wireBulkToolbar();
  wireModals();
  populateFilters();
}
export function unmount() {
  _mounted = false;
  _container = null;
}

function buildHTML() {
  return `<div class="numeros-wrap">
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
          ${Object.keys(REDAC_COLOR).map(r=>`<option>${esc(r)}</option>`).join('')}
        </select>
        <div class="views-btn-wrap" data-module="articles"></div>
        <button class="btn btn-primary btn-sm" id="btn-add">+ Article</button>
      </div>
    </div>
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
  <!-- Modals inside module -->
  <div id="modal-copy" class="modal-overlay" style="display:none">
    <div class="modal modal-copy-inner">
      <h3>Dupliquer le sommaire</h3>
      <p class="modal-source">Source : <strong id="copy-from"></strong></p>
      <div class="copy-sections">
        <div class="copy-section">
          <h4>Champs à copier</h4>
          <div class="copy-checkboxes">
            <label><input type="checkbox" id="copy-pages" checked> Pages (début / fin)</label>
            <label><input type="checkbox" id="copy-type" checked> Type de contenu</label>
            <label><input type="checkbox" id="copy-rubrique" checked> Rubrique</label>
            <label><input type="checkbox" id="copy-titre"> Titre</label>
            <label><input type="checkbox" id="copy-resume"> Résumé / Angles</label>
          </div>
        </div>
        <div class="copy-section">
          <h4>Numéro de destination</h4>
          <label><span>Magazine</span><input id="copy-dest-mag" type="text" placeholder="(laisse vide = même magazine)"></label>
          <label><span>Numéro</span><input id="copy-dest-num" type="text" placeholder="ex: 59" required></label>
          <div class="copy-issue-opts">
            <label class="copy-create-toggle"><input type="checkbox" id="copy-create-issue"> Créer aussi dans la table Magazines</label>
          </div>
          <div id="copy-issue-form" style="display:none">
            <label><span>Format page</span><select id="copy-fmt"><option value=""></option></select></label>
            <label><span>Deadline rédaction</span><input id="copy-dl-redac" type="date"></label>
            <label><span>Deadline bouclage</span><input id="copy-dl-bouclage" type="date"></label>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-copy-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-copy-confirm">Dupliquer</button>
      </div>
    </div>
  </div>
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
  const statusEl = document.getElementById('filter-status');
  // status filter not persisted in State currently — TODO Features A/B
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
  get('btn-add')?.addEventListener('click', () => addArticle());
}

// ── LOAD / RENDER ─────────────────────────────────────────────────────────────
export async function loadArticles() {
  if (!_mounted) return;
  const params = {};
  if (State.currentMag) params.magazine = State.currentMag;
  if (State.currentNum) params.numero   = State.currentNum;
  const staEl = document.getElementById('filter-status');
  if (staEl?.value) params.status = staEl.value;

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

  // Apply column widths
  const table = document.getElementById('main-table');
  colManager.applyWidths(table);
  const thead = table?.querySelector('thead');
  colManager.attachResizeHandles(thead, () => colManager.applyWidths(table));
}

function renderArticlesTable(articles) {
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  if (!tbody) return;
  State.selectedIds.clear(); updateBulkToolbar();
  if (!articles.length) { tbody.innerHTML = ''; if(empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = articles.map(a => {
    const staOpts = STATUS_OPTIONS.map(s => `<option${s===a.status?' selected':''}>${s}</option>`).join('');
    const staClass = STATUS_CLASS[a.status] || 's-todo';
    const typeSel = `<option value=""></option>` + (State.cfg.type_contenu||[]).map(c => `<option${c.value===a.type_contenu?' selected':''}>${esc(c.value)}</option>`).join('');
    const rubSel  = `<option value=""></option>` + (State.cfg.rubrique||[]).map(c => `<option${c.value===a.rubrique?' selected':''}>${esc(c.value)}</option>`).join('');
    return `<tr data-id="${a.id}">
      <td class="td-check col-pin"><input type="checkbox" class="row-check" data-id="${a.id}"></td>
      <td class="td-mag"><span>${esc(a.magazine)} N°${esc(a.numero)}</span></td>
      <td><span class="editable" contenteditable="true" data-field="page_debut" data-id="${a.id}">${esc(a.page_debut??'')}</span></td>
      <td><span class="editable" contenteditable="true" data-field="page_fin"   data-id="${a.id}">${esc(a.page_fin??'')}</span></td>
      <td><span class="editable" contenteditable="true" data-field="titre"      data-id="${a.id}">${esc(a.titre)}</span></td>
      <td><select class="cell-select" data-field="type_contenu" data-id="${a.id}">${typeSel}</select></td>
      <td><select class="cell-select" data-field="rubrique"     data-id="${a.id}">${rubSel}</select></td>
      <td><select class="status-select ${staClass}" data-field="status" data-id="${a.id}">${staOpts}</select></td>
      <td><select class="cell-select redac-select" data-field="redacteur" data-id="${a.id}">
        <option value="">—</option>
        ${Object.keys(REDAC_COLOR).map(r => `<option${r===a.redacteur?' selected':''}>${r}</option>`).join('')}
      </select></td>
      <td class="td-wrap"><span class="editable editable-wrap" contenteditable="true" data-field="resume"       data-id="${a.id}">${esc(a.resume??'')}</span></td>
      <td class="td-wrap"><span class="editable editable-wrap" contenteditable="true" data-field="commentaires" data-id="${a.id}">${esc(a.commentaires??'')}</span></td>
      <td class="col-source-cell">${renderSourceCell(a)}</td>
      <td><div class="actions"><button class="btn-icon" data-del="${a.id}" title="Supprimer">🗑</button></div></td>
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
  await API.putArticle(id, { [field]: value || null });
  if (oldValue !== undefined && oldValue !== value) {
    pushUndo({ type:'edit', id, field, old: oldValue || null });
  }
}

async function addArticle() {
  if (!State.currentMag) { alert('Sélectionne un magazine et un numéro.'); return; }
  await API.postArticle({ magazine: State.currentMag, numero: State.currentNum||'', titre:'Nouvel article', status:'A faire' });
  loadArticles();
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
    } else if (field==='redacteur') {
      wrap.innerHTML = `<select id="bulk-value"><option value="">— Aucun —</option>${Object.keys(REDAC_COLOR).map(r=>`<option>${r}</option>`).join('')}</select>`;
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
  // Copy modal
  document.getElementById('copy-create-issue')?.addEventListener('change', function() {
    const form = document.getElementById('copy-issue-form');
    if(form) form.style.display = this.checked ? 'flex' : 'none';
  });
  document.getElementById('btn-copy-cancel')?.addEventListener('click', () => { document.getElementById('modal-copy').style.display='none'; });
  document.getElementById('modal-copy')?.addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
  document.getElementById('btn-copy-confirm')?.addEventListener('click', async () => {
    const destMag = document.getElementById('copy-dest-mag').value.trim() || State.copySourceMag;
    const destNum = document.getElementById('copy-dest-num').value.trim();
    if (!destNum) { alert('Numéro de destination requis.'); return; }
    const fields = [];
    if (document.getElementById('copy-pages').checked)    { fields.push('page_debut','page_fin'); }
    if (document.getElementById('copy-type').checked)     fields.push('type_contenu');
    if (document.getElementById('copy-rubrique').checked) fields.push('rubrique');
    if (document.getElementById('copy-titre').checked)    fields.push('titre');
    if (document.getElementById('copy-resume').checked)   fields.push('resume');
    const r = await fetch('/api/copy-issue', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ magazine:destMag, from_numero:State.copySourceNum, to_numero:destNum, fields })
    });
    const result = await r.json();
    if (document.getElementById('copy-create-issue').checked) {
      await API.postIssue({
        magazine:destMag, numero:destNum,
        format_page: document.getElementById('copy-fmt').value||null,
        deadline_redaction: document.getElementById('copy-dl-redac').value||null,
        deadline: document.getElementById('copy-dl-bouclage').value||null,
      });
    }
    document.getElementById('modal-copy').style.display='none';
    if (r.ok) alert(`${result.copied} article(s) copié(s) vers N°${destNum}.`);
    // Refresh issues in state
    const [issues] = await Promise.all([API.getIssues()]);
    State.setAllIssues(issues);
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

export function openCopyModal(mag, num) {
  State.setCopySource(mag || State.currentMag, num || State.currentNum);
  if (!State.copySourceMag) { alert('Sélectionne un magazine d\'abord.'); return; }
  document.getElementById('copy-from').textContent = `${State.copySourceMag} — N°${State.copySourceNum}`;
  document.getElementById('copy-dest-mag').value = State.copySourceMag;
  document.getElementById('copy-dest-num').value = '';
  const fmtSel = document.getElementById('copy-fmt');
  if (fmtSel) fmtSel.innerHTML = '<option value=""></option>' + (State.cfg.format_page||[]).map(c=>`<option>${esc(c.value)}</option>`).join('');
  document.getElementById('modal-copy').style.display = 'flex';
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
  if (state.columns) colManager.applyState(state.columns);
  loadArticles();
}
