/* PressPilot V2 — issues.js
   Module: Magazines & Numéros table.
   Exposes mount(container) / unmount(). */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, statNumClass, REDAC_COLOR } from './helpers.js';
import { renderViewsDropdown } from './views.js';
import { loadStatsBar } from './ui-shell.js';
import { createColumnManager } from './column-manager.js';
import { openCopyModal } from './copy-modal.js';
import { openCDF } from './cdf.js';

const DEFAULT_COLUMNS = [
  { key:'magazine',          label:'Magazine',           width:130 },
  { key:'numero',            label:'N°',                 width:60  },
  { key:'redacteur',         label:'Rédacteur',          width:90  },
  { key:'type_magazine',     label:'Type',               width:90  },
  { key:'format_page',       label:'Format',             width:70  },
  { key:'date_lancement',    label:'Lancement',          width:110 },
  { key:'deadline_redaction',label:'Deadline rédac.',    width:115 },
  { key:'deadline',          label:'Deadline bouclage',  width:115 },
  { key:'statut_numero',     label:'Statut',             width:130 },
  { key:'statut_paiement',   label:'Paiement',           width:90  },
  { key:'articles',          label:'Articles',           width:60  },
  { key:'actions',           label:'',                   width:120, hideable:false },
];
export const colManager = createColumnManager('magazines', DEFAULT_COLUMNS);

let _mounted = false;
let _container = null;
let _extraIssueId = null;

// Density state
const DENSITY_KEY = 'pp_mag_density';
let _density = localStorage.getItem(DENSITY_KEY) || 'comfortable';

export function mount(container) {
  _container = container;
  _mounted = true;
  container.innerHTML = buildHTML();
  applyDensity();
  wireFilters();
  wireDensity();
  wireColToggle();
  loadIssues();
}
export function unmount() {
  _mounted = false;
  _container = null;
}

function buildHTML() {
  const hideableCols = DEFAULT_COLUMNS.filter(c => c.hideable !== false);

  return `<div class="numeros-wrap" id="mag-wrap">
    <div class="numeros-header">
      <h2 class="dash-title">Magazines &amp; Numéros</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="text" id="issues-search" placeholder="Rechercher..." style="width:160px" value="${esc(State.issuesSearch)}">
        <select id="issues-filter-statut"><option value="">Tous statuts</option></select>
        <select id="issues-filter-redacteur">
          <option value="">Tous rédacteurs</option>
          ${Object.keys(REDAC_COLOR).map(r=>`<option>${esc(r)}</option>`).join('')}
        </select>
        <!-- Colonnes show/hide -->
        <div class="col-toggle-btn" id="mag-col-toggle-wrap">
          <button class="btn btn-ghost btn-sm" id="btn-mag-col-toggle">Colonnes ▾</button>
          <div class="col-toggle-menu" id="mag-col-toggle-menu">
            ${hideableCols.map(c => `<label class="col-toggle-item">
              <input type="checkbox" data-col-key="${c.key}"${colManager.isHidden(c.key) ? '' : ' checked'}>
              ${esc(c.label)}
            </label>`).join('')}
          </div>
        </div>
        <!-- Densité -->
        <button class="btn btn-ghost btn-sm density-btn${_density==='compact'?' active':''}" id="btn-mag-density-compact" title="Vue compacte">Compact</button>
        <button class="btn btn-ghost btn-sm density-btn${_density==='comfortable'?' active':''}" id="btn-mag-density-comfortable" title="Vue confortable">Confort.</button>
        <div class="views-btn-wrap" data-module="magazines"></div>
        <button class="btn btn-primary btn-sm" id="btn-add-issue">+ Numéro</button>
      </div>
    </div>
    <div class="table-wrap">
    <table class="numeros-table" id="numeros-table">
      <colgroup>
        <col data-col="magazine">
        <col data-col="numero">
        <col data-col="redacteur">
        <col data-col="type_magazine">
        <col data-col="format_page">
        <col data-col="date_lancement">
        <col data-col="deadline_redaction">
        <col data-col="deadline">
        <col data-col="statut_numero">
        <col data-col="statut_paiement">
        <col data-col="articles">
        <col data-col="actions">
      </colgroup>
      <thead>
        <tr>
          <th data-sort-iss="magazine"          data-col="magazine">Magazine</th>
          <th data-sort-iss="numero"            data-col="numero">N°</th>
          <th data-sort-iss="redacteur"         data-col="redacteur">Rédacteur</th>
          <th data-sort-iss="type_magazine"     data-col="type_magazine">Type</th>
          <th data-sort-iss="format_page"       data-col="format_page">Format</th>
          <th data-sort-iss="date_lancement"    data-col="date_lancement">Lancement</th>
          <th data-sort-iss="deadline_redaction" data-col="deadline_redaction">Deadline rédac.</th>
          <th data-sort-iss="deadline"          data-col="deadline">Deadline bouclage</th>
          <th data-sort-iss="statut_numero"     data-col="statut_numero">Statut</th>
          <th data-sort-iss="statut_paiement"   data-col="statut_paiement">Paiement</th>
          <th                                   data-col="articles">Articles</th>
          <th                                   data-col="actions"></th>
        </tr>
      </thead>
      <tbody id="issues-tbody"></tbody>
    </table>
    </div>
  </div>
  <!-- Issue extra modal -->
  <div id="modal-issue-extra" class="modal-overlay" style="display:none">
    <div class="modal" style="width:480px">
      <h3 id="modal-extra-title">Notes &amp; liens</h3>
      <input type="hidden" id="extra-issue-id">
      <div style="display:flex;flex-direction:column;gap:12px">
        <label style="font-size:12px;color:var(--ink-soft)">
          <span style="display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Lien dossier</span>
          <input id="extra-lien" type="text" style="width:100%" placeholder="https://drive.google.com/...">
        </label>
        <label style="font-size:12px;color:var(--ink-soft)">
          <span style="display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Note</span>
          <textarea id="extra-note" rows="3" style="width:100%"></textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-extra-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-extra-save">Enregistrer</button>
      </div>
    </div>
  </div>`;
}

function wireFilters() {
  document.getElementById('issues-search')?.addEventListener('input', e => { State.setIssuesSearch(e.target.value.toLowerCase()); renderIssuesTable(); });
  document.getElementById('issues-filter-statut')?.addEventListener('change', e => { State.setIssuesFilterStatut(e.target.value); renderIssuesTable(); });
  document.getElementById('issues-filter-redacteur')?.addEventListener('change', e => { State.setIssuesFilterRedacteur(e.target.value); renderIssuesTable(); });
  document.getElementById('btn-add-issue')?.addEventListener('click', () => addIssue());

  document.querySelectorAll('#numeros-table th[data-sort-iss]').forEach(th => {
    th.style.cursor = 'pointer'; th.style.userSelect = 'none';
    th.addEventListener('click', () => {
      if (State.issuesSortBy === th.dataset.sortIss) State.setIssuesSortDir(State.issuesSortDir * -1);
      else { State.setIssuesSortBy(th.dataset.sortIss); State.setIssuesSortDir(1); }
      renderIssuesTable();
    });
  });

  // Extra modal
  document.getElementById('btn-extra-cancel')?.addEventListener('click', () => { document.getElementById('modal-issue-extra').style.display='none'; });
  document.getElementById('modal-issue-extra')?.addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
  document.getElementById('btn-extra-save')?.addEventListener('click', async () => {
    const id   = _extraIssueId;
    const note = document.getElementById('extra-note').value;
    const lien = document.getElementById('extra-lien').value;
    await API.patchIssue(id, { note, lien_dossier:lien });
    const iss = State.allIssues.find(i=>i.id===id);
    if (iss) { iss.note=note; iss.lien_dossier=lien; }
    document.getElementById('modal-issue-extra').style.display='none';
  });
}

// ── DENSITY ───────────────────────────────────────────────────────────────────
function applyDensity() {
  const wrap = document.getElementById('mag-wrap');
  if (wrap) wrap.dataset.density = _density;
  document.querySelectorAll('#mag-wrap .density-btn').forEach(btn => {
    btn.classList.toggle('active',
      (btn.id === 'btn-mag-density-compact'     && _density === 'compact') ||
      (btn.id === 'btn-mag-density-comfortable' && _density === 'comfortable')
    );
  });
}

function wireDensity() {
  document.getElementById('btn-mag-density-compact')?.addEventListener('click', () => {
    _density = 'compact';
    localStorage.setItem(DENSITY_KEY, _density);
    applyDensity();
  });
  document.getElementById('btn-mag-density-comfortable')?.addEventListener('click', () => {
    _density = 'comfortable';
    localStorage.setItem(DENSITY_KEY, _density);
    applyDensity();
  });
}

// ── COL TOGGLE (show/hide) ────────────────────────────────────────────────────
function wireColToggle() {
  const btn  = document.getElementById('btn-mag-col-toggle');
  const menu = document.getElementById('mag-col-toggle-menu');
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
  const table = document.getElementById('numeros-table');
  if (!table) return;
  DEFAULT_COLUMNS.forEach(col => {
    const hidden = colManager.isHidden(col.key);
    const colEl = table.querySelector(`col[data-col="${col.key}"]`);
    if (colEl) colEl.classList.toggle('col-hidden', hidden);
    table.querySelectorAll(`th[data-col="${col.key}"]`).forEach(el => el.classList.toggle('col-hidden', hidden));
    table.querySelectorAll(`td[data-col="${col.key}"]`).forEach(el => el.classList.toggle('col-hidden', hidden));
  });
  // Sync checkboxes
  const menu = document.getElementById('mag-col-toggle-menu');
  if (menu) {
    menu.querySelectorAll('input[data-col-key]').forEach(cb => {
      cb.checked = !colManager.isHidden(cb.dataset.colKey);
    });
  }
}

async function loadIssues() {
  const [issues, dash] = await Promise.all([API.getIssues(), API.getDashboard()]);
  State.setAllIssues(issues);
  const byKey = {};
  (dash.by_issue || []).forEach(bi => { byKey[`${bi.magazine}|${bi.numero}`] = bi; });
  State.setArticlesByKey(byKey);
  populateIssueFilterDropdowns();
  renderIssuesTable();
  renderViewsDropdown('magazines', getMagazinesState, applyMagazinesState);
  // Apply column widths + resize handles for magazines table
  const table = document.getElementById('numeros-table');
  colManager.applyWidths(table);
  const thead = table?.querySelector('thead');
  colManager.attachResizeHandles(thead, () => colManager.applyWidths(table));
  applyColVisibility();
}

function populateIssueFilterDropdowns() {
  const statSel = document.getElementById('issues-filter-statut');
  if (!statSel) return;
  const statuts = [...new Set(State.allIssues.map(i=>i.statut_numero).filter(Boolean))].sort();
  statSel.innerHTML = '<option value="">Tous statuts</option>' + statuts.map(s=>`<option${s===State.issuesFilterStatut?' selected':''}>${esc(s)}</option>`).join('');
}

function renderIssuesTable() {
  let issues = [...State.allIssues];
  if (State.issuesSearch)          issues = issues.filter(i => (i.magazine||'').toLowerCase().includes(State.issuesSearch) || (i.numero||'').toLowerCase().includes(State.issuesSearch) || (i.redacteur||'').toLowerCase().includes(State.issuesSearch));
  if (State.issuesFilterStatut)    issues = issues.filter(i => i.statut_numero === State.issuesFilterStatut);
  if (State.issuesFilterRedacteur) issues = issues.filter(i => i.redacteur === State.issuesFilterRedacteur);
  issues.sort((a, b) => {
    const va = a[State.issuesSortBy] || '', vb = b[State.issuesSortBy] || '';
    return va < vb ? -State.issuesSortDir : va > vb ? State.issuesSortDir : 0;
  });

  document.querySelectorAll('#numeros-table th[data-sort-iss]').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.sortIss === State.issuesSortBy) th.classList.add(State.issuesSortDir===1?'sorted-asc':'sorted-desc');
  });

  const statNums = (State.cfg.statut_numero   || []).map(c => c.value);
  const statPays = (State.cfg.statut_paiement || []).map(c => c.value);
  const formats  = (State.cfg.format_page     || []).map(c => c.value);
  const tbody = document.getElementById('issues-tbody');
  if (!tbody) return;

  if (!issues.length) { tbody.innerHTML = `<tr><td colspan="12" class="empty">Aucun numéro trouvé.</td></tr>`; return; }

  tbody.innerHTML = issues.map(iss => {
    const key = `${iss.magazine}|${iss.numero}`;
    const bi = State.articlesByKey[key];
    const artCount = bi ? bi.total : 0;
    return `<tr data-issue-id="${iss.id}">
      <td data-col="magazine"><span class="iss-span" contenteditable="true" data-field="magazine" data-id="${iss.id}">${esc(iss.magazine)}</span></td>
      <td data-col="numero"><span class="iss-span" contenteditable="true" data-field="numero"   data-id="${iss.id}">${esc(iss.numero)}</span></td>
      <td data-col="redacteur"><select class="iss-select" data-field="redacteur" data-id="${iss.id}">
        <option value=""></option>
        ${Object.keys(REDAC_COLOR).map(r=>`<option${iss.redacteur===r?' selected':''}>${r}</option>`).join('')}
      </select></td>
      <td data-col="type_magazine"><select class="iss-select" data-field="type_magazine" data-id="${iss.id}">
        <option value=""></option>
        ${['People','Criminel','Royauté','Lifestyle'].map(t=>`<option${iss.type_magazine===t?' selected':''}>${t}</option>`).join('')}
      </select></td>
      <td data-col="format_page"><select class="iss-select" data-field="format_page" data-id="${iss.id}">
        <option value=""></option>
        ${formats.map(f=>`<option${iss.format_page===f?' selected':''}>${esc(f)}</option>`).join('')}
      </select></td>
      <td data-col="date_lancement"><input class="iss-date" type="date" data-field="date_lancement"    data-id="${iss.id}" value="${iss.date_lancement||''}"></td>
      <td data-col="deadline_redaction"><input class="iss-date" type="date" data-field="deadline_redaction" data-id="${iss.id}" value="${iss.deadline_redaction||''}"></td>
      <td data-col="deadline"><input class="iss-date" type="date" data-field="deadline"           data-id="${iss.id}" value="${iss.deadline||''}"></td>
      <td data-col="statut_numero"><select class="iss-select" data-field="statut_numero" data-id="${iss.id}">
        <option value=""></option>
        ${statNums.map(s=>`<option${iss.statut_numero===s?' selected':''}>${esc(s)}</option>`).join('')}
      </select></td>
      <td data-col="statut_paiement"><select class="iss-select" data-field="statut_paiement" data-id="${iss.id}">
        <option value=""></option>
        ${statPays.map(s=>`<option${iss.statut_paiement===s?' selected':''}>${esc(s)}</option>`).join('')}
      </select></td>
      <td data-col="articles" style="text-align:center;color:var(--text-muted);font-size:11px">${artCount}</td>
      <td data-col="actions"><div class="row-actions">
        <button class="btn-icon" title="Voir articles" data-view-mag="${esc(iss.magazine)}" data-view-num="${esc(iss.numero)}">📋</button>
        <button class="btn-icon" title="CDF"           data-cdf-mag="${esc(iss.magazine)}"  data-cdf-num="${esc(iss.numero)}">🗺</button>
        <button class="btn-icon" title="Dupliquer"     data-dup-mag="${esc(iss.magazine)}"  data-dup-num="${esc(iss.numero)}">⧉</button>
        <button class="btn-icon" title="Notes &amp; liens" data-extra-id="${iss.id}" data-extra-note="${esc(iss.note||'')}" data-extra-lien="${esc(iss.lien_dossier||'')}">📝</button>
        <button class="btn-icon" title="Supprimer"     data-del-id="${iss.id}">🗑</button>
      </div></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.iss-span[contenteditable]').forEach(el => {
    el.addEventListener('blur', () => patchIssue(Number(el.dataset.id), el.dataset.field, el.textContent.trim()));
    el.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();el.blur();} });
  });
  tbody.querySelectorAll('.iss-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await patchIssue(Number(sel.dataset.id), sel.dataset.field, sel.value||null);
      if (['redacteur','statut_numero'].includes(sel.dataset.field)) {
        const [issues2, dash2] = await Promise.all([API.getIssues(), API.getDashboard()]);
        State.setAllIssues(issues2);
        const byKey = {};
        (dash2.by_issue || []).forEach(bi => { byKey[`${bi.magazine}|${bi.numero}`] = bi; });
        State.setArticlesByKey(byKey);
        loadStatsBar();
      }
    });
  });
  tbody.querySelectorAll('.iss-date').forEach(inp => {
    inp.addEventListener('change', () => patchIssue(Number(inp.dataset.id), inp.dataset.field, inp.value||null));
  });
  tbody.querySelectorAll('[data-view-mag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mag = btn.dataset.viewMag, num = btn.dataset.viewNum;
      State.setCurrentMag(mag); State.setCurrentNum(num);
      import('./nav.js').then(m => m.navigate('articles'));
    });
  });
  tbody.querySelectorAll('[data-cdf-mag]').forEach(btn => { btn.addEventListener('click', () => openCDF(btn.dataset.cdfMag, btn.dataset.cdfNum)); });
  tbody.querySelectorAll('[data-dup-mag]').forEach(btn => { btn.addEventListener('click', () => { openCopyModal(btn.dataset.dupMag, btn.dataset.dupNum); }); });
  tbody.querySelectorAll('[data-extra-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      _extraIssueId = Number(btn.dataset.extraId);
      document.getElementById('extra-issue-id').value = _extraIssueId;
      document.getElementById('extra-note').value = btn.dataset.extraNote||'';
      document.getElementById('extra-lien').value = btn.dataset.extraLien||'';
      document.getElementById('modal-issue-extra').style.display = 'flex';
    });
  });
  tbody.querySelectorAll('[data-del-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce numéro ?')) return;
      await API.deleteIssue(btn.dataset.delId);
      await loadIssues();
      loadStatsBar();
    });
  });

  // Apply column widths + resize after each render
  const tableEl = document.getElementById('numeros-table');
  colManager.applyWidths(tableEl);
  const theadEl = tableEl?.querySelector('thead');
  colManager.attachResizeHandles(theadEl, () => colManager.applyWidths(tableEl));
  applyColVisibility();
}

async function patchIssue(id, field, value) {
  await API.patchIssue(id, { [field]: value });
  const iss = State.allIssues.find(i => i.id === id);
  if (iss) iss[field] = value;
}
async function addIssue() {
  const mag = prompt('Magazine :'); if (!mag) return;
  const num = prompt('Numéro :');   if (!num) return;
  await API.postIssue({ magazine:mag, numero:num });
  await loadIssues();
  loadStatsBar();
}

export function getMagazinesState() {
  return {
    search: State.issuesSearch,
    filterStatut: State.issuesFilterStatut,
    filterRedacteur: State.issuesFilterRedacteur,
    sortBy: State.issuesSortBy,
    sortDir: State.issuesSortDir,
    density: _density,
    ...colManager.getState(),
  };
}
export function applyMagazinesState(state) {
  if (!state) return;
  if (state.search          !== undefined) { State.setIssuesSearch(state.search);               const el = document.getElementById('issues-search');            if(el) el.value = state.search; }
  if (state.filterStatut    !== undefined) { State.setIssuesFilterStatut(state.filterStatut);   const el = document.getElementById('issues-filter-statut');     if(el) el.value = state.filterStatut; }
  if (state.filterRedacteur !== undefined) { State.setIssuesFilterRedacteur(state.filterRedacteur); const el = document.getElementById('issues-filter-redacteur'); if(el) el.value = state.filterRedacteur; }
  if (state.sortBy          !== undefined) { State.setIssuesSortBy(state.sortBy); }
  if (state.sortDir         !== undefined) { State.setIssuesSortDir(state.sortDir); }
  if (state.density)  { _density = state.density; localStorage.setItem(DENSITY_KEY, _density); applyDensity(); }
  if (state.columns)  colManager.applyState(state.columns);
  renderIssuesTable();
}
