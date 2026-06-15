/* PressPilot V2 — dashboard.js
   Module: Kanban dashboard.
   Exposes mount(container) / unmount().

   Features B (V2) :
   - Drag & drop entre colonnes Kanban (met à jour statut_numero via PATCH /api/issues/:id)
   - Responsive (colonnes en scroll-x sur mobile) */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, issueKanbanCol, statNumClass, buildPayBadge, isOverdue, fmtDateShort, fmtMonth, REDAC_COLOR } from './helpers.js';
import { renderViewsDropdown } from './views.js';
import { openCDF } from './cdf.js';
import { navigate } from './nav.js';

let _mounted = false;

// Map kanban column key → statut_numero value to set when a card is dropped
const COL_TO_STATUT = {
  avenir:  'En préparation',
  encours: 'En cours de rédaction',
  termine: 'Bouclé',
  standby: 'Stand By/Bloqué/Décalé',
};

// Drag & drop state
let _dragIssueId   = null;
let _dragSourceCol = null;

export function mount(container) {
  _mounted = true;
  container.innerHTML = buildHTML();
  setupFilters();
  renderKanban();
  renderViewsDropdown('dashboard', getDashboardState, applyDashboardState);
}
export function unmount() {
  _mounted = false;
}

function buildHTML() {
  return `<div class="dashboard-wrap">
    <div class="dash-header">
      <h2 class="dash-title">Dashboard</h2>
      <div class="dash-kpis" id="dash-kpis"></div>
      <div style="flex:1"></div>
      <div class="views-btn-wrap" data-module="dashboard"></div>
    </div>
    <div class="dash-filters">
      <input type="text" id="dash-search" placeholder="Rechercher..." style="width:140px">
      <select id="dash-filter-month"><option value="">Tous les mois</option></select>
      <select id="dash-filter-redacteur">
        <option value="">Tous rédacteurs</option>
        ${Object.keys(REDAC_COLOR).map(r=>`<option>${r}</option>`).join('')}
      </select>
      <select id="dash-filter-statut"><option value="">Tous statuts</option></select>
    </div>
    <div class="kanban-board" id="kanban-board"></div>
  </div>`;
}

function setupFilters() {
  const months = [...new Set(State.allIssues.map(i => i.deadline?.slice(0,7)).filter(Boolean))].sort().reverse();
  const monthSel = document.getElementById('dash-filter-month');
  if (monthSel) {
    months.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = fmtMonth(m); monthSel.appendChild(o); });
    if (State.dashFilterMonth) monthSel.value = State.dashFilterMonth;
  }
  const statSel = document.getElementById('dash-filter-statut');
  if (statSel) {
    [...new Set(State.allIssues.map(i => i.statut_numero).filter(Boolean))].sort()
      .forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; statSel.appendChild(o); });
    if (State.dashFilterStatut) statSel.value = State.dashFilterStatut;
  }
  const search = document.getElementById('dash-search');
  if (search) {
    search.value = State.dashSearch;
    search.addEventListener('input', e => { State.setDashSearch(e.target.value.toLowerCase()); renderKanban(); });
  }
  monthSel?.addEventListener('change', e => { State.setDashFilterMonth(e.target.value); renderKanban(); });
  document.getElementById('dash-filter-redacteur')?.addEventListener('change', e => { State.setDashFilterRedacteur(e.target.value); renderKanban(); });
  statSel?.addEventListener('change', e => { State.setDashFilterStatut(e.target.value); renderKanban(); });
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  if (!board) return;
  let issues = [...State.allIssues];
  if (State.dashSearch) { const q = State.dashSearch; issues = issues.filter(i => (i.magazine||'').toLowerCase().includes(q) || (i.numero||'').toLowerCase().includes(q)); }
  if (State.dashFilterMonth)     issues = issues.filter(i => i.deadline?.slice(0,7) === State.dashFilterMonth);
  if (State.dashFilterRedacteur) issues = issues.filter(i => i.redacteur === State.dashFilterRedacteur);
  if (State.dashFilterStatut)    issues = issues.filter(i => i.statut_numero === State.dashFilterStatut);

  const encours = issues.filter(i => issueKanbanCol(i) === 'encours').length;
  const termine = issues.filter(i => issueKanbanCol(i) === 'termine').length;
  const avenir  = issues.filter(i => issueKanbanCol(i) === 'avenir').length;
  const standby = issues.filter(i => issueKanbanCol(i) === 'standby').length;
  const kpis = document.getElementById('dash-kpis');
  if (kpis) kpis.innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Numéros</div><div class="kpi-value">${issues.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">En cours</div><div class="kpi-value">${encours}</div></div>
    <div class="kpi-card"><div class="kpi-label">Terminés</div><div class="kpi-value">${termine}</div></div>
    <div class="kpi-card"><div class="kpi-label">À venir</div><div class="kpi-value">${avenir}</div></div>
    <div class="kpi-card kpi-muted"><div class="kpi-label">Standby</div><div class="kpi-value">${standby}</div></div>`;

  const cols = { avenir: [], encours: [], termine: [], standby: [] };
  for (const iss of issues) cols[issueKanbanCol(iss)].push(iss);

  const colDefs = [
    { key: 'avenir',  label: 'A venir',         cls: 'kanban-col-avenir' },
    { key: 'encours', label: 'En cours',         cls: 'kanban-col-encours' },
    { key: 'termine', label: 'Terminé',          cls: 'kanban-col-termine' },
    { key: 'standby', label: 'Standby / Annulé', cls: 'kanban-col-standby' },
  ];
  const hasFilter = !!(State.dashSearch || State.dashFilterMonth || State.dashFilterRedacteur || State.dashFilterStatut);

  board.innerHTML = colDefs.map(col => {
    const colIssues = cols[col.key];
    const collapsed = !hasFilter;
    const cards = colIssues.map(iss => buildKanbanCard(iss)).join('');
    return `<div class="kanban-col ${col.cls} ${collapsed?'collapsed':''}" id="kcol-${col.key}" data-col="${col.key}">
      <div class="kanban-col-header">
        <span>${col.label} <span class="col-count">${colIssues.length}</span></span>
        <span class="col-toggle">${collapsed?'▸':'▾'}</span>
      </div>
      <div class="kanban-col-body" data-col="${col.key}">${cards || '<div class="kanban-empty-col">Aucun numéro</div>'}</div>
    </div>`;
  }).join('');

  board.querySelectorAll('.kanban-col-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const col = hdr.closest('.kanban-col');
      col.classList.toggle('collapsed');
      hdr.querySelector('.col-toggle').textContent = col.classList.contains('collapsed') ? '▸' : '▾';
    });
  });
  board.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.kanban-cdf-btn')) return;
      const mag = card.dataset.mag, num = card.dataset.num;
      State.setCurrentMag(mag); State.setCurrentNum(num);
      navigate('articles');
    });
  });
  board.querySelectorAll('.kanban-cdf-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openCDF(btn.dataset.mag, btn.dataset.num); });
  });

  // ── Drag & drop ──────────────────────────────────────────────────────────
  setupDragDrop(board);
}

// ── Drag & drop helpers ────────────────────────────────────────────────────────

function setupDragDrop(board) {
  // Make cards draggable
  board.querySelectorAll('.kanban-card[data-issue-id]').forEach(card => {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', e => {
      _dragIssueId   = card.dataset.issueId;
      _dragSourceCol = card.closest('.kanban-col-body')?.dataset.col;
      card.classList.add('kanban-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragIssueId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('kanban-dragging');
      board.querySelectorAll('.kanban-col-body').forEach(b => b.classList.remove('kanban-drop-target'));
    });
  });

  // Make column bodies drop zones
  board.querySelectorAll('.kanban-col-body').forEach(colBody => {
    colBody.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      board.querySelectorAll('.kanban-col-body').forEach(b => b.classList.remove('kanban-drop-target'));
      colBody.classList.add('kanban-drop-target');
    });

    colBody.addEventListener('dragleave', e => {
      if (!colBody.contains(e.relatedTarget)) {
        colBody.classList.remove('kanban-drop-target');
      }
    });

    colBody.addEventListener('drop', async e => {
      e.preventDefault();
      colBody.classList.remove('kanban-drop-target');

      const targetCol = colBody.dataset.col;
      if (!_dragIssueId || targetCol === _dragSourceCol) return;

      const newStatut = COL_TO_STATUT[targetCol];
      if (!newStatut) return;

      const issueId = Number(_dragIssueId);

      // Optimistic update in State
      const issue = State.allIssues.find(i => i.id === issueId);
      if (issue) {
        issue.statut_numero = newStatut;
        State.setAllIssues([...State.allIssues]);
      }

      renderKanban();

      // Persist to server
      try {
        await API.patchIssue(issueId, { statut_numero: newStatut });
      } catch (err) {
        console.error('Drag & drop PATCH failed', err);
        // Revert: re-fetch issues
        try {
          const fresh = await API.getIssues();
          State.setAllIssues(fresh);
          renderKanban();
        } catch (_) { /* ignore */ }
      }

      _dragIssueId   = null;
      _dragSourceCol = null;
    });
  });
}

function buildKanbanCard(iss) {
  const key = `${iss.magazine}|${iss.numero}`;
  const bi = State.articlesByKey[key] || {};
  const done  = bi.done  || 0;
  const total = bi.total || 0;
  const prob  = (bi.problem || 0) + (bi.rework || 0);
  const restants = Math.max(0, total - done);
  const pct = total ? Math.round(done / total * 100) : 0;
  const redacColor = REDAC_COLOR[iss.redacteur] || null;
  const cardBg     = redacColor ? redacColor + '18' : '#F5F1EA';
  const cardBorder = redacColor ? redacColor + '35' : 'rgba(0,0,0,.08)';
  const dlRow = (label, date) => {
    if (!date) return '';
    const over = isOverdue(date);
    return `<div class="kanban-date-row${over?' overdue':''}"><span class="kanban-date-label">${label}</span> ${fmtDateShort(date)}${over?' ⚠':''}</div>`;
  };
  const payHtml  = buildPayBadge(iss.statut_paiement);
  const redacHtml = iss.redacteur ? `<span class="kanban-redac redac-${esc(iss.redacteur)}">${esc(iss.redacteur)}</span>` : '';
  return `<div class="kanban-card" style="background:${cardBg};border-color:${cardBorder}" data-mag="${esc(iss.magazine)}" data-num="${esc(iss.numero)}" data-issue-id="${iss.id || ''}">
    <div class="kanban-card-head">
      <div class="kanban-mag">${esc(iss.magazine)}</div>
      <div style="display:flex;align-items:center;gap:4px">
        <div class="kanban-num">N°${esc(iss.numero)}</div>
        <button class="kanban-cdf-btn btn-icon" title="CDF" data-mag="${esc(iss.magazine)}" data-num="${esc(iss.numero)}" style="font-size:11px;opacity:.55;padding:1px 4px;margin-top:0">🗺</button>
      </div>
    </div>
    <div class="kanban-meta">
      ${iss.type_magazine ? `<span>${esc(iss.type_magazine)}</span>` : ''}
      ${iss.format_page   ? `<span>${esc(iss.format_page)}</span>` : ''}
      ${iss.statut_numero ? `<span class="issue-stat-pill ${statNumClass(iss.statut_numero)}">${esc(iss.statut_numero)}</span>` : ''}
    </div>
    <div class="kanban-dates">
      ${dlRow('Lancement', iss.date_lancement)}
      ${dlRow('Rédac.', iss.deadline_redaction)}
      ${dlRow('Bouclage', iss.deadline)}
    </div>
    ${total ? `<div class="kanban-progress"><div class="kanban-progress-fill" style="width:${pct}%"></div></div>` : ''}
    <div class="kanban-stats">
      ${total ? `<span class="kstat kstat-rest">⏳ ${restants} restant${restants!==1?'s':''}</span>` : '<span style="font-size:9px;color:var(--text-muted)">0 article</span>'}
      ${prob  ? `<span class="kstat kstat-prob">⚠ ${prob}</span>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">${payHtml}${redacHtml}</div>
  </div>`;
}

export function getDashboardState() {
  return { search: State.dashSearch, month: State.dashFilterMonth, redacteur: State.dashFilterRedacteur, statut: State.dashFilterStatut };
}
export function applyDashboardState(state) {
  if (!state) return;
  if (state.search    !== undefined) { State.setDashSearch(state.search);           const el = document.getElementById('dash-search');            if(el) el.value = state.search; }
  if (state.month     !== undefined) { State.setDashFilterMonth(state.month);       const el = document.getElementById('dash-filter-month');      if(el) el.value = state.month; }
  if (state.redacteur !== undefined) { State.setDashFilterRedacteur(state.redacteur); const el = document.getElementById('dash-filter-redacteur'); if(el) el.value = state.redacteur; }
  if (state.statut    !== undefined) { State.setDashFilterStatut(state.statut);     const el = document.getElementById('dash-filter-statut');    if(el) el.value = state.statut; }
  renderKanban();
}
