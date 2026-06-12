/* Sommaire DCKAY — app.js */
'use strict';

// ─── STATE ────────────────────────────────────────────────
let cfg = {};
let allIssues = [];
let articlesByKey = {};
let calViewMode = 'month';
let calCurrentDate = startOfToday();
let calFilterRedacteur = '';
let calShownStatuts = null; // null = not init; Set = included statuts
let calAvailStatuts = [];
let currentMag = '', currentNum = '';
let artSortField = 'page_debut', artSortDir = 1;
let artSearch = '', artFilterRedacteur = '';
let selectedIds = new Set();
let copySourceMag = '', copySourceNum = '';
let issuesSearch = '', issuesFilterStatut = '', issuesFilterRedacteur = '';
let issuesSortBy = 'magazine', issuesSortDir = 1;
let extraIssueId = null;
let dashSearch = '', dashFilterMonth = '', dashFilterRedacteur = '', dashFilterStatut = '';
let billingModalSetup = false;
let billingData = [];

const STATUS_OPTIONS = ['A faire','Not started','Stand by','In progress','Fact-check','ReWork','Sujet à revoir','Trop court','Problème','Done but not sure','Done'];
const STATUS_CLASS = {
  'Done': 's-done', 'Done but not sure': 's-done-unsure',
  'In progress': 's-progress', 'Fact-check': 's-progress',
  'A faire': 's-todo', 'Not started': 's-todo', 'Stand by': 's-todo',
  'Problème': 's-problem', 'Trop court': 's-problem',
  'ReWork': 's-rework', 'Sujet à revoir': 's-rework',
};
const REDAC_COLOR = { Dany: '#9A5F25', Coralie: '#2A7A5A', Lena: '#7B5EA7' };
const PRICING = { '32P': 400, '48P': 650, '64P': 750, '80P': 800, '96P': 900, '144P': 1500 };
const SOMMAIRE_FEE = 70;
const DOW_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

// ─── HELPERS ──────────────────────────────────────────────
function startOfToday() {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateShort(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
}
function fmtMonth(yyyyMM) {
  if (!yyyyMM) return '';
  const [y, m] = yyyyMM.split('-');
  return new Date(Number(y), Number(m)-1, 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
}
function isOverdue(s) { return s ? new Date(s) < startOfToday() : false; }
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function toYMD(d) {
  const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${mo}-${day}`;
}
function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, dd] = s.split('-').map(Number);
  return new Date(y, m-1, dd);
}

function issueKanbanCol(issue) {
  const s = issue.statut_numero || '';
  if (['Annulé','Stand By/Bloqué/Décalé'].includes(s)) return 'standby';
  if (['Bouclé','Déposé','Publié','Paru'].includes(s)) return 'termine';
  if (['En cours de rédaction','Rédaction'].includes(s)) return 'encours';
  const today = startOfToday();
  if (issue.date_lancement && new Date(issue.date_lancement) > today) return 'avenir';
  return 'encours';
}

// ─── SAVED VIEWS ──────────────────────────────────────────
const VIEWS_KEY = 'sommaire_views_v1';

function getViews(module) {
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}')[module] || []; }
  catch { return []; }
}
function saveView(module, name, state) {
  const all = JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}');
  if (!all[module]) all[module] = [];
  const idx = all[module].findIndex(v => v.name === name);
  if (idx >= 0) all[module][idx] = { name, state };
  else all[module].push({ name, state });
  localStorage.setItem(VIEWS_KEY, JSON.stringify(all));
}
function deleteView(module, name) {
  const all = JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}');
  if (all[module]) all[module] = all[module].filter(v => v.name !== name);
  localStorage.setItem(VIEWS_KEY, JSON.stringify(all));
}
function findDefaultView(module) {
  return getViews(module).find(v => v.isDefault) || null;
}
function toggleDefaultView(module, name) {
  const all = JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}');
  if (!all[module]) return;
  const wasDefault = all[module].find(v => v.name === name)?.isDefault || false;
  all[module] = all[module].map(v => ({ ...v, isDefault: v.name === name ? !wasDefault : false }));
  localStorage.setItem(VIEWS_KEY, JSON.stringify(all));
}
function renderViewsDropdown(module, getState, applyState) {
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
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleDefaultView(module, btn.dataset.vn);
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
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteView(module, btn.dataset.vn);
        renderViewsDropdown(module, getState, applyState);
        menu.style.display = 'none';
      });
    });
    wrap.querySelector('.views-save').addEventListener('click', e => {
      e.stopPropagation();
      const name = prompt('Nom de la vue :');
      if (!name?.trim()) return;
      saveView(module, name.trim(), getState());
      renderViewsDropdown(module, getState, applyState);
      menu.style.display = 'none';
    });
  });
}
document.addEventListener('click', () => {
  document.querySelectorAll('.views-menu, .cal-statut-dropdown').forEach(m => m.style.display = 'none');
});

// ─── BOOT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  cfg = await fetch('/api/config').then(r => r.json());
  await refreshIssues();
  await loadStatsBar();
  await loadDashboard();
  setupTabs();
  setupBulkToolbar();
  setupModals();
  await populateArticleFilters();
  populateIssueFilterDropdowns();
  setupIssueFilters();
  setupCalendarControls();
  setInterval(() => loadStatsBar(), 60000);
});

async function refreshIssues() {
  const [issues, dash] = await Promise.all([
    fetch('/api/issues').then(r => r.json()),
    fetch('/api/dashboard').then(r => r.json())
  ]);
  allIssues = issues;
  articlesByKey = {};
  (dash.by_issue || []).forEach(bi => { articlesByKey[`${bi.magazine}|${bi.numero}`] = bi; });
}

// ─── TABS ─────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}
function activateTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'sommaire')    loadArticles();
  if (name === 'numeros')     loadIssues();
  if (name === 'calendrier')  loadCalendar();
  if (name === 'dashboard')   loadDashboard();
  if (name === 'settings')    loadSettings();
  if (name === 'facturation') loadBilling();

  // Apply default view if one is set for this module
  const modMap = { sommaire:'articles', numeros:'magazines', calendrier:'calendrier', dashboard:'dashboard' };
  const applyMap = { articles:applyArticlesState, magazines:applyMagazinesState, calendrier:applyCalendarState, dashboard:applyDashboardState };
  const modKey = modMap[name];
  if (modKey) { const dv = findDefaultView(modKey); if (dv) applyMap[modKey](dv.state); }
}

// ─── ARTICLE FILTERS (inside tab) ─────────────────────────
async function populateArticleFilters() {
  const nums = await fetch('/api/numeros').then(r => r.json());
  const mags = [...new Set(nums.map(n => n.magazine))].sort();
  const selMag = document.getElementById('filter-mag');
  selMag.innerHTML = '<option value="">— Magazine —</option>' + mags.map(m => `<option>${esc(m)}</option>`).join('');
  selMag.addEventListener('change', () => {
    currentMag = selMag.value;
    const filtered = nums.filter(n => n.magazine === currentMag).map(n => n.numero);
    document.getElementById('filter-num').innerHTML = '<option value="">— Numéro —</option>' + filtered.map(n => `<option>${esc(n)}</option>`).join('');
    currentNum = '';
    if (document.getElementById('tab-sommaire').classList.contains('active')) loadArticles();
  });
  document.getElementById('filter-num').addEventListener('change', e => {
    currentNum = e.target.value;
    if (document.getElementById('tab-sommaire').classList.contains('active')) loadArticles();
  });
  document.getElementById('filter-status').addEventListener('change', () => {
    if (document.getElementById('tab-sommaire').classList.contains('active')) loadArticles();
  });
  document.getElementById('art-search').addEventListener('input', e => {
    artSearch = e.target.value.toLowerCase();
    if (document.getElementById('tab-sommaire').classList.contains('active')) loadArticles();
  });
  document.getElementById('art-filter-redacteur').addEventListener('change', e => {
    artFilterRedacteur = e.target.value;
    if (document.getElementById('tab-sommaire').classList.contains('active')) loadArticles();
  });
  document.getElementById('btn-add').addEventListener('click', () => addArticle());
  renderViewsDropdown('articles', getArticlesState, applyArticlesState);
}

function getArticlesState() {
  return {
    mag: currentMag, num: currentNum,
    status: document.getElementById('filter-status')?.value || '',
    search: artSearch, redacteur: artFilterRedacteur,
    sortField: artSortField, sortDir: artSortDir
  };
}
function applyArticlesState(state) {
  if (state.mag !== undefined) { currentMag = state.mag; const el = document.getElementById('filter-mag'); if(el) el.value = state.mag; }
  if (state.num !== undefined) {
    currentNum = state.num;
    const el = document.getElementById('filter-num');
    if (el) el.innerHTML = `<option value="">— Numéro —</option>${state.num ? `<option selected>${esc(state.num)}</option>` : ''}`;
  }
  if (state.status !== undefined) { const el = document.getElementById('filter-status'); if(el) el.value = state.status; }
  if (state.search !== undefined) { artSearch = state.search; const el = document.getElementById('art-search'); if(el) el.value = state.search; }
  if (state.redacteur !== undefined) { artFilterRedacteur = state.redacteur; const el = document.getElementById('art-filter-redacteur'); if(el) el.value = state.redacteur; }
  if (state.sortField) { artSortField = state.sortField; artSortDir = state.sortDir || 1; }
  loadArticles();
}

// ─── STATS BAR ────────────────────────────────────────────
async function loadStatsBar() {
  const bar = document.getElementById('stats-bar');
  const encours = allIssues.filter(iss => ['En cours de rédaction','Rédaction'].includes(iss.statut_numero));
  if (!encours.length) { bar.innerHTML = '<span class="stats-empty">Aucun numéro en cours de rédaction</span>'; return; }
  bar.innerHTML = encours.map((iss, i) => {
    const key = `${iss.magazine}|${iss.numero}`;
    const bi = articlesByKey[key] || {};
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
      document.getElementById('filter-mag').value = mag;
      document.getElementById('filter-num').innerHTML = `<option value="">— Numéro —</option><option selected>${esc(num)}</option>`;
      currentMag = mag; currentNum = num;
      activateTab('sommaire');
    });
  });
}

// ─── DASHBOARD KANBAN ────────────────────────────────────
async function loadDashboard() {
  setupDashboardFilters();
  renderKanban(); // handles KPI computation
  renderViewsDropdown('dashboard', getDashboardState, applyDashboardState);
}

function getDashboardState() {
  return { search: dashSearch, month: dashFilterMonth, redacteur: dashFilterRedacteur, statut: dashFilterStatut };
}
function applyDashboardState(state) {
  if (state.search    !== undefined) { dashSearch = state.search;           const el = document.getElementById('dash-search');            if(el) el.value = state.search; }
  if (state.month     !== undefined) { dashFilterMonth = state.month;       const el = document.getElementById('dash-filter-month');      if(el) el.value = state.month; }
  if (state.redacteur !== undefined) { dashFilterRedacteur = state.redacteur; const el = document.getElementById('dash-filter-redacteur'); if(el) el.value = state.redacteur; }
  if (state.statut    !== undefined) { dashFilterStatut = state.statut;     const el = document.getElementById('dash-filter-statut');    if(el) el.value = state.statut; }
  renderKanban();
}

function setupDashboardFilters() {
  const monthSel = document.getElementById('dash-filter-month');
  if (monthSel && monthSel.querySelectorAll('option').length <= 1) {
    const months = [...new Set(allIssues.map(i => i.deadline?.slice(0,7)).filter(Boolean))].sort().reverse();
    months.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = fmtMonth(m); monthSel.appendChild(o); });
  }
  const statSel = document.getElementById('dash-filter-statut');
  if (statSel && statSel.querySelectorAll('option').length <= 1) {
    [...new Set(allIssues.map(i => i.statut_numero).filter(Boolean))].sort()
      .forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; statSel.appendChild(o); });
  }
  const search = document.getElementById('dash-search');
  if (search && !search._wired) {
    search._wired = true;
    search.addEventListener('input', e => { dashSearch = e.target.value.toLowerCase(); renderKanban(); });
    document.getElementById('dash-filter-month').addEventListener('change', e => { dashFilterMonth = e.target.value; renderKanban(); });
    document.getElementById('dash-filter-redacteur').addEventListener('change', e => { dashFilterRedacteur = e.target.value; renderKanban(); });
    document.getElementById('dash-filter-statut').addEventListener('change', e => { dashFilterStatut = e.target.value; renderKanban(); });
  }
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  let issues = [...allIssues];
  if (dashSearch) { const q = dashSearch; issues = issues.filter(i => (i.magazine||'').toLowerCase().includes(q) || (i.numero||'').toLowerCase().includes(q)); }
  if (dashFilterMonth)     issues = issues.filter(i => i.deadline?.slice(0,7) === dashFilterMonth);
  if (dashFilterRedacteur) issues = issues.filter(i => i.redacteur === dashFilterRedacteur);
  if (dashFilterStatut)    issues = issues.filter(i => i.statut_numero === dashFilterStatut);

  // Update KPI cards based on filtered issues
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

  const hasFilter = !!(dashSearch || dashFilterMonth || dashFilterRedacteur || dashFilterStatut);

  board.innerHTML = colDefs.map(col => {
    const colIssues = cols[col.key];
    const collapsed = !hasFilter;
    const cards = colIssues.map(iss => buildKanbanCard(iss)).join('');
    return `<div class="kanban-col ${col.cls} ${collapsed?'collapsed':''}" id="kcol-${col.key}">
      <div class="kanban-col-header">
        <span>${col.label} <span class="col-count">${colIssues.length}</span></span>
        <span class="col-toggle">${collapsed?'▸':'▾'}</span>
      </div>
      <div class="kanban-col-body">${cards || '<div style="padding:8px;font-size:11px;color:var(--muted);font-style:italic">Aucun numéro</div>'}</div>
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
      document.getElementById('filter-mag').value = mag;
      document.getElementById('filter-num').innerHTML = `<option value="">— Numéro —</option><option selected>${esc(num)}</option>`;
      currentMag = mag; currentNum = num;
      activateTab('sommaire');
    });
  });
  board.querySelectorAll('.kanban-cdf-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openCDF(btn.dataset.mag, btn.dataset.num); });
  });
}

function buildKanbanCard(iss) {
  const key = `${iss.magazine}|${iss.numero}`;
  const bi = articlesByKey[key] || {};
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
    return `<div class="kanban-date-row${over ? ' overdue' : ''}"><span class="kanban-date-label">${label}</span> ${fmtDateShort(date)}${over ? ' ⚠' : ''}</div>`;
  };
  const payHtml  = buildPayBadge(iss.statut_paiement);
  const redacHtml = iss.redacteur ? `<span class="kanban-redac redac-${esc(iss.redacteur)}">${esc(iss.redacteur)}</span>` : '';

  return `<div class="kanban-card" style="background:${cardBg};border-color:${cardBorder}" data-mag="${esc(iss.magazine)}" data-num="${esc(iss.numero)}">
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
      ${total ? `<span class="kstat kstat-rest">⏳ ${restants} restant${restants!==1?'s':''}</span>` : '<span style="font-size:9px;color:var(--muted)">0 article</span>'}
      ${prob  ? `<span class="kstat kstat-prob">⚠ ${prob}</span>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">${payHtml}${redacHtml}</div>
  </div>`;
}

function statNumClass(s) {
  if (!s) return '';
  if (['En cours de rédaction','Rédaction'].includes(s)) return 'pill-progress';
  if (['Bouclé','Déposé','Publié','Paru'].includes(s)) return 'pill-done';
  if (['Annulé','Stand By/Bloqué/Décalé'].includes(s)) return 'pill-problem';
  return 'pill-todo';
}
function buildPayBadge(s) {
  if (!s) return '';
  const cls = s==='Payé' ? 'kanban-pay-paye' : s==='Facturé' ? 'kanban-pay-facture' : 'kanban-pay-att';
  return `<span class="kanban-pay ${cls}">${esc(s)}</span>`;
}

// ─── ARTICLES TABLE ──────────────────────────────────────
async function loadArticles() {
  const mag = document.getElementById('filter-mag').value;
  const num = document.getElementById('filter-num').value;
  const sta = document.getElementById('filter-status').value;
  const params = new URLSearchParams();
  if (mag) params.set('magazine', mag);
  if (num) params.set('numero', num);
  if (sta) params.set('status', sta);
  let articles = await fetch('/api/articles?' + params).then(r => r.json());

  if (artSearch) {
    const q = artSearch;
    articles = articles.filter(a =>
      (a.titre||'').toLowerCase().includes(q) ||
      (a.rubrique||'').toLowerCase().includes(q) ||
      (a.type_contenu||'').toLowerCase().includes(q) ||
      (a.magazine||'').toLowerCase().includes(q)
    );
  }
  if (artFilterRedacteur) {
    const validKeys = new Set(allIssues.filter(i => i.redacteur === artFilterRedacteur).map(i => `${i.magazine}|${i.numero}`));
    articles = articles.filter(a => validKeys.has(`${a.magazine}|${a.numero}`));
  }
  if (artSortField) {
    articles.sort((a, b) => {
      const va = a[artSortField] ?? 9999;
      const vb = b[artSortField] ?? 9999;
      return va < vb ? -artSortDir : va > vb ? artSortDir : 0;
    });
  }
  renderArticlesTable(articles);
  renderViewsDropdown('articles', getArticlesState, applyArticlesState);
}

function renderArticlesTable(articles) {
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  selectedIds.clear(); updateBulkToolbar();
  if (!articles.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  tbody.innerHTML = articles.map(a => {
    const staOpts = STATUS_OPTIONS.map(s => `<option${s===a.status?' selected':''}>${s}</option>`).join('');
    const staClass = STATUS_CLASS[a.status] || 's-todo';
    const typeSel = `<option value=""></option>` + (cfg.type_contenu||[]).map(c => `<option${c.value===a.type_contenu?' selected':''}>${esc(c.value)}</option>`).join('');
    const rubSel  = `<option value=""></option>` + (cfg.rubrique||[]).map(c => `<option${c.value===a.rubrique?' selected':''}>${esc(c.value)}</option>`).join('');
    return `<tr data-id="${a.id}">
      <td class="td-check"><input type="checkbox" class="row-check" data-id="${a.id}"></td>
      <td class="td-mag"><span>${esc(a.magazine)} N°${esc(a.numero)}</span></td>
      <td><span class="editable" contenteditable="true" data-field="page_debut" data-id="${a.id}">${esc(a.page_debut??'')}</span></td>
      <td><span class="editable" contenteditable="true" data-field="page_fin"   data-id="${a.id}">${esc(a.page_fin??'')}</span></td>
      <td><span class="editable" contenteditable="true" data-field="titre"      data-id="${a.id}">${esc(a.titre)}</span></td>
      <td><select class="cell-select" data-field="type_contenu" data-id="${a.id}">${typeSel}</select></td>
      <td><select class="cell-select" data-field="rubrique"     data-id="${a.id}">${rubSel}</select></td>
      <td><select class="status-select ${staClass}" data-field="status" data-id="${a.id}">${staOpts}</select></td>
      <td class="td-wrap"><span class="editable editable-wrap" contenteditable="true" data-field="resume"       data-id="${a.id}">${esc(a.resume??'')}</span></td>
      <td class="td-wrap"><span class="editable editable-wrap" contenteditable="true" data-field="commentaires" data-id="${a.id}">${esc(a.commentaires??'')}</span></td>
      <td class="col-source-cell">${renderSourceCell(a)}</td>
      <td><div class="actions"><button class="btn-icon" data-del="${a.id}" title="Supprimer">🗑</button></div></td>
    </tr>`;
  }).join('');

  document.querySelectorAll('thead th[data-sort]').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.sort === artSortField) th.classList.add(artSortDir===1?'sorted-asc':'sorted-desc');
    th.onclick = () => {
      if (artSortField === th.dataset.sort) artSortDir *= -1; else { artSortField = th.dataset.sort; artSortDir = 1; }
      loadArticles();
    };
  });

  tbody.querySelectorAll('.editable').forEach(el => {
    el.addEventListener('blur', () => patchArticle(Number(el.dataset.id), el.dataset.field, el.textContent.trim()));
    el.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); el.blur(); } });
  });
  tbody.querySelectorAll('.cell-select').forEach(sel => {
    sel.addEventListener('change', () => patchArticle(Number(sel.dataset.id), sel.dataset.field, sel.value));
  });
  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => {
      sel.className = 'status-select ' + (STATUS_CLASS[sel.value] || 's-todo');
      patchArticle(Number(sel.dataset.id), 'status', sel.value);
    });
  });
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet article ?')) return;
      await fetch(`/api/articles/${btn.dataset.del}`, { method:'DELETE' });
      loadArticles();
    });
  });
  tbody.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(Number(cb.dataset.id)); else selectedIds.delete(Number(cb.dataset.id));
      document.getElementById('check-all').checked = selectedIds.size === articles.length;
      updateBulkToolbar();
    });
  });
  document.getElementById('check-all').onchange = function() {
    tbody.querySelectorAll('.row-check').forEach(cb => {
      cb.checked = this.checked;
      if (this.checked) selectedIds.add(Number(cb.dataset.id)); else selectedIds.delete(Number(cb.dataset.id));
    });
    updateBulkToolbar();
  };
  setupSourceCells(tbody);
}

function renderSourceCell(a) {
  if (a.article_source) return `<a class="source-link" href="${esc(a.article_source)}" target="_blank" rel="noopener">🔗 Source</a>`;
  return `<span class="source-empty" data-edit-source="${a.id}">+ source</span>`;
}
function setupSourceCells(container) {
  container.querySelectorAll('.source-empty[data-edit-source]').forEach(el => {
    el.addEventListener('click', () => {
      const url = prompt('URL de la source :');
      if (url?.trim()) { patchArticle(Number(el.dataset.editSource), 'article_source', url.trim()); loadArticles(); }
    });
  });
  container.querySelectorAll('.source-link').forEach(lnk => {
    lnk.addEventListener('dblclick', e => {
      e.preventDefault();
      const id = lnk.closest('tr').dataset.id;
      const url = prompt('Modifier la source :', lnk.href);
      if (url !== null) { patchArticle(Number(id), 'article_source', url.trim()); loadArticles(); }
    });
  });
}
async function patchArticle(id, field, value) {
  await fetch(`/api/articles/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ [field]: value || null })
  });
}
async function addArticle() {
  if (!currentMag) { alert('Sélectionne un magazine et un numéro.'); return; }
  await fetch('/api/articles', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ magazine:currentMag, numero:currentNum||'', titre:'Nouvel article', status:'A faire' })
  });
  loadArticles();
}

// ─── BULK TOOLBAR ────────────────────────────────────────
function setupBulkToolbar() {
  const fieldSel = document.getElementById('bulk-field');
  fieldSel.addEventListener('change', () => {
    const wrap = document.getElementById('bulk-value-wrap');
    const field = fieldSel.value;
    if (!field) { wrap.innerHTML=''; return; }
    if (field==='status') {
      wrap.innerHTML = `<select id="bulk-value">${STATUS_OPTIONS.map(s=>`<option>${s}</option>`).join('')}</select>`;
    } else if (field==='type_contenu') {
      wrap.innerHTML = `<select id="bulk-value"><option value=""></option>${(cfg.type_contenu||[]).map(c=>`<option>${esc(c.value)}</option>`).join('')}</select>`;
    } else if (field==='rubrique') {
      wrap.innerHTML = `<select id="bulk-value"><option value=""></option>${(cfg.rubrique||[]).map(c=>`<option>${esc(c.value)}</option>`).join('')}</select>`;
    } else if (field==='magazine') {
      const mags = [...new Set(allIssues.map(i=>i.magazine))].sort();
      wrap.innerHTML = `<select id="bulk-value"><option value=""></option>${mags.map(m=>`<option>${esc(m)}</option>`).join('')}</select>`;
    } else {
      wrap.innerHTML = `<input id="bulk-value" type="text" style="width:140px" placeholder="Nouvelle valeur">`;
    }
  });
  document.getElementById('btn-bulk-apply').addEventListener('click', async () => {
    const field = fieldSel.value;
    const valEl = document.getElementById('bulk-value');
    if (!field || !valEl || !selectedIds.size) return;
    await fetch('/api/articles/bulk', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ids:[...selectedIds], updates:{ [field]: valEl.value } })
    });
    loadArticles();
  });
  document.getElementById('btn-bulk-duplicate').addEventListener('click', async () => {
    if (!selectedIds.size) return;
    await fetch('/api/articles/duplicate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ids:[...selectedIds] })
    });
    loadArticles();
  });
  document.getElementById('btn-bulk-delete').addEventListener('click', async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Supprimer ${selectedIds.size} article(s) ?`)) return;
    await Promise.all([...selectedIds].map(id => fetch(`/api/articles/${id}`,{method:'DELETE'})));
    loadArticles();
  });
  document.getElementById('btn-bulk-clear').addEventListener('click', () => {
    selectedIds.clear();
    document.querySelectorAll('.row-check').forEach(cb => cb.checked = false);
    document.getElementById('check-all').checked = false;
    updateBulkToolbar();
  });
}
function updateBulkToolbar() {
  const bar = document.getElementById('bulk-toolbar');
  const cnt = document.getElementById('bulk-count');
  if (!selectedIds.size) { bar.style.display='none'; return; }
  bar.style.display = 'flex';
  cnt.innerHTML = `<strong>${selectedIds.size}</strong> sélectionné(s)`;
}

// ─── ISSUES TABLE ────────────────────────────────────────
function populateIssueFilterDropdowns() {
  const statSel = document.getElementById('issues-filter-statut');
  const statuts = [...new Set(allIssues.map(i=>i.statut_numero).filter(Boolean))].sort();
  statSel.innerHTML = '<option value="">Tous statuts</option>' + statuts.map(s=>`<option>${esc(s)}</option>`).join('');
}
function setupIssueFilters() {
  document.getElementById('issues-search').addEventListener('input', e => { issuesSearch=e.target.value.toLowerCase(); renderIssuesTable(); });
  document.getElementById('issues-filter-statut').addEventListener('change', e => { issuesFilterStatut=e.target.value; renderIssuesTable(); });
  document.getElementById('issues-filter-redacteur').addEventListener('change', e => { issuesFilterRedacteur=e.target.value; renderIssuesTable(); });
  document.getElementById('btn-add-issue').addEventListener('click', () => addIssue());

  // Column header sort
  document.querySelectorAll('#numeros-table th[data-sort-iss]').forEach(th => {
    th.style.cursor = 'pointer'; th.style.userSelect = 'none';
    th.addEventListener('click', () => {
      if (issuesSortBy === th.dataset.sortIss) issuesSortDir *= -1;
      else { issuesSortBy = th.dataset.sortIss; issuesSortDir = 1; }
      renderIssuesTable();
    });
  });
  renderViewsDropdown('magazines', getMagazinesState, applyMagazinesState);
}

function getMagazinesState() {
  return { search: issuesSearch, filterStatut: issuesFilterStatut, filterRedacteur: issuesFilterRedacteur, sortBy: issuesSortBy, sortDir: issuesSortDir };
}
function applyMagazinesState(state) {
  if (state.search          !== undefined) { issuesSearch = state.search;               const el = document.getElementById('issues-search');            if(el) el.value = state.search; }
  if (state.filterStatut    !== undefined) { issuesFilterStatut = state.filterStatut;   const el = document.getElementById('issues-filter-statut');     if(el) el.value = state.filterStatut; }
  if (state.filterRedacteur !== undefined) { issuesFilterRedacteur = state.filterRedacteur; const el = document.getElementById('issues-filter-redacteur'); if(el) el.value = state.filterRedacteur; }
  if (state.sortBy          !== undefined) { issuesSortBy = state.sortBy; }
  if (state.sortDir         !== undefined) { issuesSortDir = state.sortDir; }
  renderIssuesTable();
}

async function loadIssues() {
  await refreshIssues();
  populateIssueFilterDropdowns();
  renderIssuesTable();
  renderViewsDropdown('magazines', getMagazinesState, applyMagazinesState);
}

function renderIssuesTable() {
  let issues = [...allIssues];
  if (issuesSearch)          issues = issues.filter(i => (i.magazine||'').toLowerCase().includes(issuesSearch) || (i.numero||'').toLowerCase().includes(issuesSearch) || (i.redacteur||'').toLowerCase().includes(issuesSearch));
  if (issuesFilterStatut)    issues = issues.filter(i => i.statut_numero === issuesFilterStatut);
  if (issuesFilterRedacteur) issues = issues.filter(i => i.redacteur === issuesFilterRedacteur);
  issues.sort((a, b) => {
    const va = a[issuesSortBy] || '', vb = b[issuesSortBy] || '';
    return va < vb ? -issuesSortDir : va > vb ? issuesSortDir : 0;
  });

  // Update sort indicators
  document.querySelectorAll('#numeros-table th[data-sort-iss]').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.sortIss === issuesSortBy) th.classList.add(issuesSortDir===1?'sorted-asc':'sorted-desc');
  });

  const statNums = (cfg.statut_numero   || []).map(c => c.value);
  const statPays = (cfg.statut_paiement || []).map(c => c.value);
  const formats  = (cfg.format_page     || []).map(c => c.value);
  const tbody = document.getElementById('issues-tbody');

  if (!issues.length) { tbody.innerHTML = `<tr><td colspan="12" class="empty">Aucun numéro trouvé.</td></tr>`; return; }

  tbody.innerHTML = issues.map(iss => {
    const key = `${iss.magazine}|${iss.numero}`;
    const bi = articlesByKey[key];
    const artCount = bi ? bi.total : 0;
    return `<tr data-issue-id="${iss.id}">
      <td><span class="iss-span" contenteditable="true" data-field="magazine" data-id="${iss.id}">${esc(iss.magazine)}</span></td>
      <td><span class="iss-span" contenteditable="true" data-field="numero"   data-id="${iss.id}">${esc(iss.numero)}</span></td>
      <td><select class="iss-select" data-field="redacteur" data-id="${iss.id}">
        <option value=""></option>
        <option${iss.redacteur==='Dany'   ?' selected':''}>Dany</option>
        <option${iss.redacteur==='Coralie'?' selected':''}>Coralie</option>
        <option${iss.redacteur==='Lena'   ?' selected':''}>Lena</option>
      </select></td>
      <td><select class="iss-select" data-field="type_magazine" data-id="${iss.id}">
        <option value=""></option>
        <option${iss.type_magazine==='People'   ?' selected':''}>People</option>
        <option${iss.type_magazine==='Criminel' ?' selected':''}>Criminel</option>
        <option${iss.type_magazine==='Royauté'  ?' selected':''}>Royauté</option>
        <option${iss.type_magazine==='Lifestyle'?' selected':''}>Lifestyle</option>
      </select></td>
      <td><select class="iss-select" data-field="format_page" data-id="${iss.id}">
        <option value=""></option>
        ${formats.map(f=>`<option${iss.format_page===f?' selected':''}>${esc(f)}</option>`).join('')}
      </select></td>
      <td><input class="iss-date" type="date" data-field="date_lancement"    data-id="${iss.id}" value="${iss.date_lancement||''}"></td>
      <td><input class="iss-date" type="date" data-field="deadline_redaction" data-id="${iss.id}" value="${iss.deadline_redaction||''}"></td>
      <td><input class="iss-date" type="date" data-field="deadline"           data-id="${iss.id}" value="${iss.deadline||''}"></td>
      <td><select class="iss-select" data-field="statut_numero" data-id="${iss.id}">
        <option value=""></option>
        ${statNums.map(s=>`<option${iss.statut_numero===s?' selected':''}>${esc(s)}</option>`).join('')}
      </select></td>
      <td><select class="iss-select" data-field="statut_paiement" data-id="${iss.id}">
        <option value=""></option>
        ${statPays.map(s=>`<option${iss.statut_paiement===s?' selected':''}>${esc(s)}</option>`).join('')}
      </select></td>
      <td style="text-align:center;color:var(--fg-dim);font-size:11px">${artCount}</td>
      <td><div class="row-actions">
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
      if (['redacteur','statut_numero'].includes(sel.dataset.field)) { await refreshIssues(); loadStatsBar(); }
    });
  });
  tbody.querySelectorAll('.iss-date').forEach(inp => {
    inp.addEventListener('change', () => patchIssue(Number(inp.dataset.id), inp.dataset.field, inp.value||null));
  });
  tbody.querySelectorAll('[data-view-mag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mag = btn.dataset.viewMag, num = btn.dataset.viewNum;
      document.getElementById('filter-mag').value = mag;
      document.getElementById('filter-num').innerHTML = `<option value="">— Numéro —</option><option selected>${esc(num)}</option>`;
      currentMag = mag; currentNum = num;
      activateTab('sommaire');
    });
  });
  tbody.querySelectorAll('[data-cdf-mag]').forEach(btn => { btn.addEventListener('click', () => openCDF(btn.dataset.cdfMag, btn.dataset.cdfNum)); });
  tbody.querySelectorAll('[data-dup-mag]').forEach(btn => { btn.addEventListener('click', () => openCopyModal(btn.dataset.dupMag, btn.dataset.dupNum)); });
  tbody.querySelectorAll('[data-extra-id]').forEach(btn => { btn.addEventListener('click', () => openExtraModal(Number(btn.dataset.extraId), btn.dataset.extraNote, btn.dataset.extraLien)); });
  tbody.querySelectorAll('[data-del-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce numéro ?')) return;
      await fetch(`/api/issues/${btn.dataset.delId}`, { method:'DELETE' });
      await refreshIssues(); renderIssuesTable(); loadStatsBar();
    });
  });
}

async function patchIssue(id, field, value) {
  await fetch(`/api/issues/${id}`, {
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ [field]: value })
  });
  const iss = allIssues.find(i => i.id === id);
  if (iss) iss[field] = value;
}
async function addIssue() {
  const mag = prompt('Magazine :'); if (!mag) return;
  const num = prompt('Numéro :');   if (!num) return;
  await fetch('/api/issues', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ magazine:mag, numero:num })
  });
  await refreshIssues(); renderIssuesTable(); loadStatsBar();
}

// ─── CALENDAR (iOS-style grid) ────────────────────────────
function setupCalendarControls() {
  document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      calViewMode = btn.dataset.view;
      renderCalendar();
    });
  });
  document.getElementById('cal-prev').addEventListener('click',  () => { calCurrentDate = calNav(calCurrentDate, -1); renderCalendar(); });
  document.getElementById('cal-next').addEventListener('click',  () => { calCurrentDate = calNav(calCurrentDate,  1); renderCalendar(); });
  document.getElementById('cal-today').addEventListener('click', () => { calCurrentDate = startOfToday(); renderCalendar(); });
  document.getElementById('cal-filter-redacteur').addEventListener('change', e => { calFilterRedacteur=e.target.value; renderCalendar(); });

  const statutBtn = document.getElementById('cal-statut-btn');
  if (statutBtn) {
    statutBtn.addEventListener('click', e => {
      e.stopPropagation();
      const dropdown = document.getElementById('cal-statut-dropdown');
      const open = dropdown.style.display !== 'none';
      document.querySelectorAll('.views-menu, .cal-statut-dropdown').forEach(m => m.style.display='none');
      dropdown.style.display = open ? 'none' : 'block';
    });
  }

  renderViewsDropdown('calendrier', getCalendarState, applyCalendarState);
}
function calNav(date, dir) {
  const d = new Date(date);
  if (calViewMode==='week')   { d.setDate(d.getDate() + dir*7); }
  else if (calViewMode==='month')  { d.setMonth(d.getMonth() + dir); }
  else { d.setMonth(d.getMonth() + dir*3); }
  return d;
}
function getCalendarState() {
  return {
    viewMode: calViewMode,
    filterRedacteur: calFilterRedacteur,
    filterStatuts: calShownStatuts ? [...calShownStatuts] : null
  };
}
function applyCalendarState(state) {
  if (state.viewMode !== undefined) {
    calViewMode = state.viewMode;
    document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view===calViewMode));
  }
  if (state.filterRedacteur !== undefined) { calFilterRedacteur=state.filterRedacteur; const el=document.getElementById('cal-filter-redacteur'); if(el) el.value=state.filterRedacteur; }
  if (state.filterStatuts   !== undefined) {
    calShownStatuts = state.filterStatuts ? new Set(state.filterStatuts) : null;
    buildCalStatutDropdown(calAvailStatuts);
  }
  renderCalendar();
}

function loadCalendar() {
  calAvailStatuts = [...new Set(allIssues.map(i=>i.statut_numero).filter(Boolean))].sort();
  if (calShownStatuts === null) {
    // First load: show all except Annulé / Stand By variants
    calShownStatuts = new Set(calAvailStatuts.filter(s => !/annul|stand\s*by|bloqué/i.test(s)));
  }
  buildCalStatutDropdown(calAvailStatuts);
  renderCalendar();
  renderViewsDropdown('calendrier', getCalendarState, applyCalendarState);
}

function buildCalStatutDropdown(statuses) {
  const menu = document.getElementById('cal-statut-dropdown');
  if (!menu) return;
  menu.innerHTML = statuses.map(s => `<label class="cal-statut-item">
    <input type="checkbox" value="${esc(s)}" ${calShownStatuts && calShownStatuts.has(s) ? 'checked' : ''}>
    <span>${esc(s)}</span>
  </label>`).join('');
  menu.querySelectorAll('input').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      if (!calShownStatuts) calShownStatuts = new Set(statuses);
      if (cb.checked) calShownStatuts.add(cb.value);
      else calShownStatuts.delete(cb.value);
      updateCalStatutBtnLabel(statuses);
      renderCalendar();
    });
  });
  updateCalStatutBtnLabel(statuses);
}

function updateCalStatutBtnLabel(statuses) {
  const btn = document.getElementById('cal-statut-btn');
  if (!btn) return;
  const shown = calShownStatuts ? calShownStatuts.size : statuses.length;
  btn.textContent = shown === statuses.length ? 'Statuts ▾' : `Statuts (${shown}) ▾`;
}

function getMonthWeeks(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const startDow = (first.getDay()+6)%7;
  const days = [];
  for (let i=startDow-1; i>=0; i--) days.push(new Date(year, month, -i));
  for (let d=1; d<=last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length%7!==0) { const nxt=new Date(days[days.length-1]); nxt.setDate(nxt.getDate()+1); days.push(nxt); }
  const weeks=[];
  for (let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
  return weeks;
}

function getWeekBars(weekDays, issues) {
  const weekStart = weekDays[0], weekEnd = weekDays[6];
  const bars = [];
  for (const iss of issues) {
    if (!iss.date_lancement) continue;
    const endStr = iss.deadline_redaction || iss.deadline;
    if (!endStr) continue;
    const startDate = parseLocalDate(iss.date_lancement);
    const endDate   = parseLocalDate(endStr);
    if (!startDate || !endDate || startDate > weekEnd || endDate < weekStart) continue;
    const clampStart = startDate < weekStart ? weekStart : startDate;
    const clampEnd   = endDate   > weekEnd   ? weekEnd   : endDate;
    let startCol = weekDays.findIndex(d => sameDay(d, clampStart));
    let endCol   = weekDays.findIndex(d => sameDay(d, clampEnd));
    if (startCol < 0) startCol = 0;
    if (endCol   < 0) endCol   = 6;
    bars.push({
      iss, startCol, endCol,
      color: REDAC_COLOR[iss.redacteur] || '#9A5F25',
      showLabel: startDate >= weekStart
    });
  }
  return bars;
}

function stackBars(bars) {
  const rowRanges = [];
  return bars.map(bar => {
    let row = 0;
    while (row < 12) {
      if (!rowRanges[row]) rowRanges[row] = [];
      const conflict = rowRanges[row].some(r => !(bar.endCol < r.startCol || bar.startCol > r.endCol));
      if (!conflict) { rowRanges[row].push({ startCol: bar.startCol, endCol: bar.endCol }); return { ...bar, row }; }
      row++;
    }
    return { ...bar, row: 11 };
  });
}

function renderWeekRow(weekDays, issues, today, currentMonth) {
  const dayNums = weekDays.map(day => {
    const isToday = sameDay(day, today);
    const isOther = currentMonth !== null && day.getMonth() !== currentMonth;
    let cls = 'cal-dn' + (isOther?' cal-dn-other':'');
    return `<div class="${cls}">${isToday ? `<span class="cal-dn-today">${day.getDate()}</span>` : day.getDate()}</div>`;
  }).join('');

  const rawBars = getWeekBars(weekDays, issues);
  const stacked = stackBars(rawBars);
  const rowCount = stacked.reduce((m, b) => Math.max(m, b.row), -1) + 1;
  const eventsH = Math.max(90, rowCount * 26 + 20);

  const barsHtml = stacked.map(bar => {
    const leftPct  = (bar.startCol / 7 * 100).toFixed(3);
    const widthPct = ((bar.endCol - bar.startCol + 1) / 7 * 100).toFixed(3);
    const topPx    = bar.row * 26 + 6;
    return `<div class="cal-event-bar"
      style="left:calc(${leftPct}% + 3px);width:calc(${widthPct}% - 6px);top:${topPx}px;background:${bar.color}25;border-left:3px solid ${bar.color}"
      data-mag="${esc(bar.iss.magazine)}" data-num="${esc(bar.iss.numero)}"
      title="${esc(bar.iss.magazine)} N°${esc(bar.iss.numero)}">
      ${bar.showLabel ? `<span class="cal-bar-label">${esc(bar.iss.magazine)} N°${esc(bar.iss.numero)}</span>` : ''}
    </div>`;
  }).join('');

  const guides = weekDays.map(() => `<div class="cal-col-guide"></div>`).join('');
  return `<div class="cal-week-row">
    <div class="cal-dn-grid">${dayNums}</div>
    <div class="cal-events-area" style="height:${eventsH}px">
      <div class="cal-col-guides">${guides}</div>
      ${barsHtml}
    </div>
  </div>`;
}

function renderMonthGrid(weeks, issues, today, currentMonth) {
  const header = `<div class="cal-grid-header">${DOW_LABELS.map(l=>`<div class="cal-grid-dow">${l}</div>`).join('')}</div>`;
  const rows = weeks.map(weekDays => renderWeekRow(weekDays, issues, today, currentMonth)).join('');
  return `<div class="cal-grid">${header}${rows}</div>`;
}

function renderCalendar() {
  let issues = [...allIssues];
  if (calFilterRedacteur) issues = issues.filter(i => i.redacteur===calFilterRedacteur);
  if (calShownStatuts)    issues = issues.filter(i => !i.statut_numero || calShownStatuts.has(i.statut_numero));

  const container = document.getElementById('cal-grid-container');
  const today = startOfToday();

  if (calViewMode==='week') {
    const dow = (calCurrentDate.getDay()+6)%7;
    const monday = addDays(calCurrentDate, -dow);
    const days = Array.from({length:7}, (_, i) => addDays(monday, i));
    document.getElementById('cal-range').textContent =
      monday.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}) + ' — ' +
      days[6].toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
    container.innerHTML = renderMonthGrid([days], issues, today, null);

  } else if (calViewMode==='month') {
    const y = calCurrentDate.getFullYear(), m = calCurrentDate.getMonth();
    document.getElementById('cal-range').textContent = calCurrentDate.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    container.innerHTML = renderMonthGrid(getMonthWeeks(y, m), issues, today, m);

  } else {
    const y = calCurrentDate.getFullYear(), m = calCurrentDate.getMonth();
    const months = [0,1,2].map(off => { const d=new Date(y,m+off,1); return {year:d.getFullYear(),month:d.getMonth()}; });
    const first = new Date(months[0].year, months[0].month, 1);
    const last  = new Date(months[2].year, months[2].month, 1);
    document.getElementById('cal-range').textContent =
      first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}) + ' — ' +
      last.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    container.innerHTML = `<div class="cal-3months">${months.map(({year,month}) => {
      const title = new Date(year,month,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
      return `<div class="cal-month-block"><div class="cal-month-title">${title}</div>${renderMonthGrid(getMonthWeeks(year,month), issues, today, month)}</div>`;
    }).join('')}</div>`;
  }

  container.querySelectorAll('.cal-event-bar').forEach(bar => {
    bar.addEventListener('click', e => {
      e.stopPropagation();
      const mag=bar.dataset.mag, num=bar.dataset.num;
      if (mag&&num) {
        document.getElementById('filter-mag').value = mag;
        document.getElementById('filter-num').innerHTML = `<option value="">— Numéro —</option><option selected>${esc(num)}</option>`;
        currentMag=mag; currentNum=num; activateTab('sommaire');
      }
    });
  });
}

// ─── FACTURATION ─────────────────────────────────────────
async function loadBilling() {
  billingData = await fetch('/api/billing').then(r => r.json());
  renderBilling(billingData);
  if (!billingModalSetup) { setupBillingModals(); billingModalSetup = true; }
}

function renderBilling(data) {
  const body = document.getElementById('billing-body');

  const totalBilled  = Math.round(data.reduce((s, m) => s + m.total_billed, 0) * 100) / 100;
  const totalPaid    = Math.round(data.reduce((s, m) => s + m.total_paid,   0) * 100) / 100;
  const totalBalance = Math.round((totalPaid - totalBilled) * 100) / 100;
  const balCls = totalBalance >= 0 ? 'billing-ok' : 'billing-due';

  const globalKpis = `<div class="billing-global-kpis">
    <div class="billing-gkpi"><div class="billing-gkpi-label">Total facturé</div><div class="billing-gkpi-value">${totalBilled}€</div></div>
    <div class="billing-gkpi"><div class="billing-gkpi-label">Total reçu</div><div class="billing-gkpi-value">${totalPaid}€</div></div>
    <div class="billing-gkpi ${balCls}"><div class="billing-gkpi-label">Solde total</div><div class="billing-gkpi-value">${totalBalance > 0 ? '+' : ''}${totalBalance}€</div></div>
  </div>`;

  if (!data.length) {
    body.innerHTML = globalKpis + '<div class="empty" style="padding:40px">Aucun mois de facturation. Clique sur "+ Nouveau mois" pour commencer.</div>';
    return;
  }
  body.innerHTML = globalKpis + data.map(m => renderBillingMonth(m)).join('');

  body.querySelectorAll('[data-add-line]').forEach(btn => { btn.addEventListener('click', () => openAddBillingLine(btn.dataset.addLine)); });
  body.querySelectorAll('[data-add-pay]').forEach(btn => { btn.addEventListener('click', () => openAddPayment(btn.dataset.addPay)); });
  body.querySelectorAll('[data-del-line]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette ligne ?')) return;
      await fetch(`/api/billing/lines/${btn.dataset.delLine}`, { method:'DELETE' });
      loadBilling();
    });
  });
  body.querySelectorAll('[data-del-pay]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce paiement ?')) return;
      await fetch(`/api/billing/payments/${btn.dataset.delPay}`, { method:'DELETE' });
      loadBilling();
    });
  });
  body.querySelectorAll('[data-del-month]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce mois et toutes ses données ?')) return;
      await fetch(`/api/billing/months/${encodeURIComponent(btn.dataset.delMonth)}`, { method:'DELETE' });
      loadBilling();
    });
  });

  // Inline edit: billing line price
  body.querySelectorAll('.billing-price-edit').forEach(inp => {
    inp.addEventListener('change', async () => {
      const val = inp.value !== '' ? Number(inp.value) : null;
      await fetch(`/api/billing/lines/${inp.dataset.lineId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ price_override: val })
      });
      loadBilling();
    });
  });

  // Standby toggle
  body.querySelectorAll('.billing-standby-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      await fetch(`/api/billing/lines/${cb.dataset.lineId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ standby: cb.checked ? 1 : 0 })
      });
      loadBilling();
    });
  });

  // Inline edit: payment fields
  body.querySelectorAll('.billing-pay-edit').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.payField;
      const val = field === 'amount' ? (inp.value ? Number(inp.value) : null) : (inp.value || null);
      if (field === 'amount' && !val) return;
      await fetch(`/api/billing/payments/${inp.dataset.payId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ [field]: val })
      });
      loadBilling();
    });
  });
}

function renderBillingMonth(m) {
  // balance: positive = received more (green), negative = still owed (red)
  const balance = Math.round(-m.balance * 100) / 100;
  const balClass = balance >= 0 ? 'billing-ok' : 'billing-due';
  const activeLines = m.lines.filter(l => !l.standby);
  const somCount = activeLines.length;
  const somTotal = somCount * SOMMAIRE_FEE;
  const totalMags = m.lines.length;

  const linesHtml = m.lines.length ? m.lines.map(line => {
    const fmt = line.format_page || line.manual_format;
    const mag = line.magazine || line.manual_magazine || '—';
    const numStr = line.numero ? `N°${esc(line.numero)}` : '—';
    const statBadge = line.statut_numero ? `<span class="issue-stat-pill ${statNumClass(line.statut_numero)}">${esc(line.statut_numero)}</span>` : '';
    const autoPrice = PRICING[fmt] || 0;
    const displayPrice = (line.price_override !== null && line.price_override !== undefined) ? line.price_override : autoPrice;
    const rowCls = line.standby ? 'billing-standby-row' : '';
    return `<tr class="${rowCls}">
      <td style="font-weight:600">${esc(mag)}</td>
      <td>${numStr} ${statBadge}</td>
      <td style="color:var(--muted)">${esc(fmt||'—')}</td>
      <td><input type="number" class="billing-price-edit" data-line-id="${line.id}" value="${displayPrice||''}" placeholder="—" style="width:65px;text-align:right;background:transparent;border:1px solid transparent;border-radius:3px" onfocus="this.style.border='1px solid var(--hairline-strong)'" onblur="this.style.border='1px solid transparent'"></td>
      <td style="text-align:center"><input type="checkbox" class="billing-standby-cb" data-line-id="${line.id}" ${line.standby?'checked':''} title="En attente — exclu du total facturé"></td>
      <td><button class="btn-icon" data-del-line="${line.id}">🗑</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="color:var(--muted);font-style:italic;padding:8px 12px">Aucun magazine</td></tr>`;

  const sommaireRow = somCount > 0 ? `<tr class="billing-sommaire-row">
    <td colspan="3">Création sommaire (${somCount} magazine${somCount>1?'s':''})</td>
    <td>${somCount} × ${SOMMAIRE_FEE}€ = <strong>${somTotal}€</strong></td>
    <td colspan="2"></td>
  </tr>` : '';

  const paysHtml = m.payments.length ? m.payments.map(p =>
    `<div class="billing-pay-row">
      <input type="date" class="billing-pay-edit" data-pay-id="${p.id}" data-pay-field="date" value="${p.date||''}" style="width:130px">
      <input type="number" class="billing-pay-edit" data-pay-id="${p.id}" data-pay-field="amount" value="${p.amount||''}" placeholder="€" style="width:70px">
      <input type="text" class="billing-pay-edit" data-pay-id="${p.id}" data-pay-field="notes" value="${esc(p.notes||'')}" placeholder="Note..." style="flex:1">
      <button class="btn-icon" data-del-pay="${p.id}">🗑</button>
    </div>`
  ).join('') : `<div style="color:var(--muted);font-style:italic;font-size:11px">Aucun paiement enregistré</div>`;

  return `<div class="billing-month-card">
    <div class="billing-month-hdr">
      <h3 class="billing-month-title">${fmtMonth(m.month)}</h3>
      <div class="billing-summary">
        <span class="billing-sum-item">${totalMags} magazine${totalMags!==1?'s':''}</span>
        <span class="billing-sum-sep">·</span>
        <span class="billing-sum-item">Facturé <strong>${m.total_billed}€</strong></span>
        <span class="billing-sum-item">Reçu <strong>${m.total_paid}€</strong></span>
        <span class="billing-sum-item ${balClass}">Solde <strong>${balance > 0 ? '+' : ''}${balance}€</strong></span>
      </div>
      <button class="btn btn-ghost btn-sm" data-del-month="${m.month}" style="margin-left:auto;opacity:.5">🗑</button>
    </div>
    <div class="billing-month-body">
      <div class="billing-section">
        <div class="billing-section-hd">
          <span class="billing-sec-title">Magazines</span>
          <button class="btn btn-ghost btn-sm" data-add-line="${m.month}">+ Magazine</button>
        </div>
        <table class="billing-lines-table">
          <thead><tr>
            <th>Magazine</th><th>N° / Statut</th><th>Format</th>
            <th class="billing-num">Prix</th>
            <th style="text-align:center" title="En attente">⏸</th>
            <th></th>
          </tr></thead>
          <tbody>${linesHtml}${sommaireRow}</tbody>
        </table>
      </div>
      <div class="billing-section">
        <div class="billing-section-hd">
          <span class="billing-sec-title">Paiements</span>
          <button class="btn btn-ghost btn-sm" data-add-pay="${m.month}">+ Paiement</button>
        </div>
        <div class="billing-pays">${paysHtml}</div>
      </div>
    </div>
  </div>`;
}

function openAddBillingLine(month) {
  document.getElementById('billing-line-month').value = month;

  const alreadyAdded = new Set(billingData.flatMap(md => (md.lines || []).map(l => l.issue_id)).filter(Boolean));
  const available = allIssues.filter(i => !alreadyAdded.has(i.id) && !/annulé/i.test(i.statut_numero || ''));

  const checklist = document.getElementById('billing-issues-checklist');
  if (!available.length) {
    checklist.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:8px">Tous les magazines sont déjà ajoutés pour ce mois.</div>';
  } else {
    checklist.innerHTML = available.map(i => `<label class="billing-check-item">
      <input type="checkbox" class="billing-issue-cb" value="${i.id}">
      <span>${esc(i.magazine)} N°${esc(i.numero)}</span>
      ${i.format_page ? `<span class="billing-format-badge">${esc(i.format_page)}</span>` : ''}
      <span class="billing-auto-price">${PRICING[i.format_page] ? PRICING[i.format_page]+'€' : '—'}</span>
    </label>`).join('');
  }

  document.getElementById('billing-manual-name').value = '';
  document.getElementById('billing-manual-format').value = '';
  document.getElementById('billing-manual-price').value = '';
  document.getElementById('modal-add-billing-line').style.display = 'flex';
}
function openAddPayment(month) {
  document.getElementById('payment-month').value = month;
  document.getElementById('payment-amount').value = '';
  document.getElementById('payment-date').value = toYMD(startOfToday());
  document.getElementById('payment-notes').value = '';
  document.getElementById('modal-add-payment').style.display = 'flex';
}

function setupBillingModals() {
  document.getElementById('btn-add-billing').addEventListener('click', async () => {
    const month = prompt('Mois de facturation (format YYYY-MM) :', new Date().toISOString().slice(0,7));
    if (!month?.match(/^\d{4}-\d{2}$/)) { if(month) alert('Format invalide. Utilise YYYY-MM (ex: 2026-06)'); return; }
    await fetch('/api/billing/months', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ month })
    });
    loadBilling();
  });

  document.getElementById('btn-billing-line-cancel').addEventListener('click', () => { document.getElementById('modal-add-billing-line').style.display='none'; });
  document.getElementById('btn-billing-line-confirm').addEventListener('click', async () => {
    const month = document.getElementById('billing-line-month').value;
    const checkedCbs = [...document.querySelectorAll('.billing-issue-cb:checked')];
    const manualName   = document.getElementById('billing-manual-name').value.trim();
    const manualFormat = document.getElementById('billing-manual-format').value;
    const manualPrice  = document.getElementById('billing-manual-price').value;

    if (!checkedCbs.length && !manualName) {
      alert('Sélectionne au moins un magazine ou entre un nom manuellement.');
      return;
    }
    const promises = checkedCbs.map(cb => fetch('/api/billing/lines', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ month, issue_id: Number(cb.value) })
    }));
    if (manualName) {
      promises.push(fetch('/api/billing/lines', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ month, manual_magazine: manualName, manual_format: manualFormat||null, price_override: manualPrice ? Number(manualPrice) : null })
      }));
    }
    await Promise.all(promises);
    document.getElementById('modal-add-billing-line').style.display='none';
    loadBilling();
  });
  document.getElementById('modal-add-billing-line').addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });

  document.getElementById('btn-payment-cancel').addEventListener('click', () => { document.getElementById('modal-add-payment').style.display='none'; });
  document.getElementById('btn-payment-confirm').addEventListener('click', async () => {
    const month  = document.getElementById('payment-month').value;
    const amount = document.getElementById('payment-amount').value;
    if (!amount) return;
    const date  = document.getElementById('payment-date').value;
    const notes = document.getElementById('payment-notes').value;
    await fetch('/api/billing/payments', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ month, amount:Number(amount), date:date||null, notes:notes||null })
    });
    document.getElementById('modal-add-payment').style.display='none';
    loadBilling();
  });
  document.getElementById('modal-add-payment').addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
}

// ─── SETTINGS ────────────────────────────────────────────
async function loadSettings() {
  cfg = await fetch('/api/config').then(r => r.json());
  const grid = document.getElementById('settings-grid');
  const labels = { type_contenu:'Types de contenu', rubrique:'Rubriques', format_page:'Formats', statut_numero:'Statuts numéro', statut_paiement:'Statuts paiement' };
  grid.innerHTML = Object.entries(cfg).map(([cat, items]) => `
    <div class="settings-section" data-cat="${cat}">
      <h3>${labels[cat]||cat}</h3>
      <div class="settings-list">
        ${items.map(item => `<div class="settings-item" data-id="${item.id}">
          <input type="color" class="color-swatch" value="${item.color||'#EDE6D8'}" data-id="${item.id}" title="Couleur">
          <span class="item-value" contenteditable="true" data-id="${item.id}" data-color="${item.color||''}">${esc(item.value)}</span>
          <button class="item-del" title="Supprimer" data-id="${item.id}">×</button>
        </div>`).join('')}
      </div>
      <div class="settings-add">
        <input type="text" class="add-value" placeholder="Nouvelle valeur...">
        <input type="color" class="add-color" value="#EDE6D8">
        <button class="btn btn-primary btn-sm add-btn">Ajouter</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.color-swatch').forEach(inp => {
    inp.addEventListener('change', async () => {
      const valueEl = grid.querySelector(`.item-value[data-id="${inp.dataset.id}"]`);
      const val = valueEl ? valueEl.textContent.trim() : '';
      await fetch(`/api/config/${inp.dataset.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({value:val,color:inp.value}) });
      if (valueEl) valueEl.dataset.color = inp.value;
    });
  });
  grid.querySelectorAll('.item-value[contenteditable]').forEach(el => {
    const orig = el.textContent.trim();
    el.addEventListener('blur', async () => {
      const newVal = el.textContent.trim();
      if (!newVal) { el.textContent=orig; return; }
      const swatch = grid.querySelector(`.color-swatch[data-id="${el.dataset.id}"]`);
      const color = swatch ? swatch.value : (el.dataset.color||null);
      await fetch(`/api/config/${el.dataset.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({value:newVal,color}) });
    });
    el.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();el.blur();} });
  });
  grid.querySelectorAll('.item-del').forEach(btn => {
    btn.addEventListener('click', async () => { await fetch(`/api/config/${btn.dataset.id}`,{method:'DELETE'}); loadSettings(); });
  });
  grid.querySelectorAll('.settings-section').forEach(sec => {
    const cat = sec.dataset.cat;
    sec.querySelector('.add-btn').addEventListener('click', async () => {
      const val = sec.querySelector('.add-value').value.trim();
      const col = sec.querySelector('.add-color').value;
      if (!val) return;
      await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({category:cat,value:val,color:col}) });
      loadSettings();
    });
  });
}

// ─── CDF MODAL ───────────────────────────────────────────
function openCDF(mag, num) {
  document.getElementById('cdf-title').textContent = `${mag} — N°${num}`;
  document.getElementById('modal-cdf').style.display = 'flex';
  loadCDF(mag, num);
}
async function loadCDF(mag, num) {
  const data = await fetch(`/api/cdf?magazine=${encodeURIComponent(mag)}&numero=${encodeURIComponent(num)}`).then(r=>r.json());
  const { articles, maxPage, colorMap } = data;
  document.getElementById('cdf-legend').innerHTML = Object.entries(colorMap).map(([label, color]) =>
    `<span class="legend-chip"><span class="legend-swatch" style="background:${color}"></span>${esc(label)}</span>`
  ).join('');
  if (!articles.length || !maxPage) {
    document.getElementById('cdf-grid').innerHTML = '<div class="empty">Aucun article avec pages pour ce numéro.</div>';
    document.getElementById('btn-export-xlsx').onclick = null; return;
  }
  const groupMap = new Map();
  for (const a of articles) {
    const fin = a.page_fin ?? a.page_debut;
    const key = `${a.page_debut}-${fin}`;
    if (!groupMap.has(key)) groupMap.set(key, { debut:a.page_debut, fin, arts:[] });
    groupMap.get(key).arts.push(a);
  }
  const sortedGroups = [...groupMap.values()].sort((a,b)=>a.debut-b.debut);
  const COLS = 10;
  let html = '';
  for (let rowStart=1; rowStart<=maxPage; rowStart+=COLS) {
    const rowEnd = Math.min(rowStart+COLS-1, maxPage);
    const rowGroups = sortedGroups.filter(g=>g.debut<=rowEnd&&g.fin>=rowStart);
    let page = rowStart, rowHtml = '';
    for (const grp of rowGroups) {
      for (let p=page; p<grp.debut&&p<=rowEnd; p++) rowHtml += `<div class="cdf-cell empty-page" style="flex:1"><div class="cdf-page-num">${p}</div></div>`;
      const cd=Math.max(rowStart,grp.debut), ce=Math.min(rowEnd,grp.fin), span=ce-cd+1;
      const color = grp.arts[0] ? (colorMap[grp.arts[0].type_contenu]||colorMap[grp.arts[0].rubrique]||null) : null;
      const badge = grp.arts.length>1 ? `<span class="cdf-count">×${grp.arts.length}</span>` : '';
      const artsHtml = grp.arts.map(a=>`<div class="cdf-art"><span class="cdf-type">${esc(a.type_contenu||'')}</span><span class="cdf-rubrique">${esc(a.rubrique||'')}</span><div class="cdf-titre">${esc(a.titre)}</div></div>`).join('');
      rowHtml += `<div class="cdf-cell" style="flex:${span};${color?`background:${color}`:''}"><div class="cdf-page-num">${grp.debut}${grp.fin!==grp.debut?`-${grp.fin}`:''} ${badge}</div><div class="cdf-arts-list">${artsHtml}</div></div>`;
      page = grp.fin+1;
    }
    for (let p=page; p<=rowEnd; p++) rowHtml += `<div class="cdf-cell empty-page" style="flex:1"><div class="cdf-page-num">${p}</div></div>`;
    html += `<div class="cdf-row">${rowHtml}</div>`;
  }
  document.getElementById('cdf-grid').innerHTML = html;

  // Click on a non-empty cell → navigate to articles for this issue
  document.querySelectorAll('#cdf-grid .cdf-cell:not(.empty-page)').forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => {
      document.getElementById('filter-mag').value = mag;
      document.getElementById('filter-num').innerHTML = `<option value="">— Numéro —</option><option selected>${esc(num)}</option>`;
      currentMag = mag; currentNum = num;
      document.getElementById('modal-cdf').style.display = 'none';
      activateTab('sommaire');
    });
  });

  document.getElementById('btn-export-xlsx').onclick = () => {
    window.location.href = `/api/export/cdf?magazine=${encodeURIComponent(mag)}&numero=${encodeURIComponent(num)}`;
  };
}

// ─── COPY MODAL ──────────────────────────────────────────
function openCopyModal(mag, num) {
  copySourceMag = mag||currentMag; copySourceNum = num||currentNum;
  if (!copySourceMag) { alert('Sélectionne un magazine d\'abord.'); return; }
  document.getElementById('copy-from').textContent = `${copySourceMag} — N°${copySourceNum}`;
  document.getElementById('copy-dest-mag').value = copySourceMag;
  document.getElementById('copy-dest-num').value = '';
  const fmtSel = document.getElementById('copy-fmt');
  fmtSel.innerHTML = '<option value=""></option>' + (cfg.format_page||[]).map(c=>`<option>${esc(c.value)}</option>`).join('');
  document.getElementById('modal-copy').style.display = 'flex';
}

// ─── ISSUE EXTRA MODAL ───────────────────────────────────
function openExtraModal(id, note, lien) {
  extraIssueId = id;
  document.getElementById('extra-issue-id').value = id;
  document.getElementById('extra-note').value = note||'';
  document.getElementById('extra-lien').value = lien||'';
  document.getElementById('modal-issue-extra').style.display = 'flex';
}

// ─── MODALS SETUP ────────────────────────────────────────
function setupModals() {
  document.getElementById('btn-cdf-close').addEventListener('click', () => { document.getElementById('modal-cdf').style.display='none'; });
  document.getElementById('modal-cdf').addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });

  document.getElementById('copy-create-issue').addEventListener('change', function() {
    document.getElementById('copy-issue-form').style.display = this.checked ? 'flex' : 'none';
  });
  document.getElementById('btn-copy-cancel').addEventListener('click', () => { document.getElementById('modal-copy').style.display='none'; });
  document.getElementById('modal-copy').addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
  document.getElementById('btn-copy-confirm').addEventListener('click', async () => {
    const destMag = document.getElementById('copy-dest-mag').value.trim() || copySourceMag;
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
      body: JSON.stringify({ magazine:destMag, from_numero:copySourceNum, to_numero:destNum, fields })
    });
    const result = await r.json();
    if (document.getElementById('copy-create-issue').checked) {
      await fetch('/api/issues', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          magazine:destMag, numero:destNum,
          format_page: document.getElementById('copy-fmt').value||null,
          deadline_redaction: document.getElementById('copy-dl-redac').value||null,
          deadline: document.getElementById('copy-dl-bouclage').value||null,
        })
      });
    }
    document.getElementById('modal-copy').style.display='none';
    if (r.ok) alert(`${result.copied} article(s) copié(s) vers N°${destNum}.`);
    await refreshIssues();
    if (document.getElementById('tab-numeros').classList.contains('active')) renderIssuesTable();
  });

  document.getElementById('btn-extra-cancel').addEventListener('click', () => { document.getElementById('modal-issue-extra').style.display='none'; });
  document.getElementById('modal-issue-extra').addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
  document.getElementById('btn-extra-save').addEventListener('click', async () => {
    const id   = extraIssueId;
    const note = document.getElementById('extra-note').value;
    const lien = document.getElementById('extra-lien').value;
    await fetch(`/api/issues/${id}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ note, lien_dossier:lien })
    });
    const iss = allIssues.find(i=>i.id===id);
    if (iss) { iss.note=note; iss.lien_dossier=lien; }
    document.getElementById('modal-issue-extra').style.display='none';
  });
}
