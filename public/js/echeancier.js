/* PressPilot V2 — echeancier.js
   Module : Échéancier — vue chronologique consolidée de toutes les deadlines.
   READ-ONLY : ne modifie aucune donnée.
   Source : GET /api/issues → deadline_redaction + deadline de chaque numéro.
   Expose : mount(container) / unmount(). */

import * as State from './state.js';
import { esc, fmtDate, redacColor, statNumClass } from './helpers.js';

// ── STATE LOCAL ──────────────────────────────────────────────────────────────
let _mounted   = false;
let _filterMag = '';
let _filterRedac = '';

// ── MOUNT / UNMOUNT ──────────────────────────────────────────────────────────
export function mount(container) {
  _mounted = true;
  _filterMag   = '';
  _filterRedac = '';
  container.innerHTML = buildShell();
  _wireFilters();
  render();
}

export function unmount() {
  _mounted = false;
}

// ── SHELL HTML ───────────────────────────────────────────────────────────────
function buildShell() {
  // Collecter les valeurs de filtres depuis State.allIssues
  const mags   = [...new Set(State.allIssues.map(i => i.magazine).filter(Boolean))].sort();
  const redacs = [...new Set(State.allIssues.map(i => i.redacteur).filter(Boolean))].sort();

  const magOptions = mags.map(m =>
    `<option value="${esc(m)}">${esc(m)}</option>`
  ).join('');

  const redacOptions = redacs.map(r =>
    `<option value="${esc(r)}">${esc(r)}</option>`
  ).join('');

  return `<div class="ech-wrap">

    <div class="ech-header">
      <div class="ech-header-left">
        <p class="ech-eyebrow">Planning éditorial</p>
        <h2 class="ech-title">Échéancier</h2>
        <p class="ech-subtitle">Toutes les deadlines rédaction et bouclage, tous magazines confondus. Lecture seule.</p>
      </div>
    </div>

    <!-- KPIs / alertes -->
    <div id="ech-alert-bar" class="ech-alert-bar"></div>

    <!-- Filtres -->
    <div class="ech-filters">
      <span class="ech-filter-label">Magazine</span>
      <select id="ech-filter-mag" class="ech-filter-select">
        <option value="">Tous</option>
        ${magOptions}
      </select>
      <span class="ech-filter-label" style="margin-left:var(--space-2)">Rédacteur</span>
      <select id="ech-filter-redac" class="ech-filter-select">
        <option value="">Tous</option>
        ${redacOptions}
      </select>
    </div>

    <!-- Timeline -->
    <div id="ech-groups" class="ech-groups"></div>

  </div>`;
}

// ── FILTRES ───────────────────────────────────────────────────────────────────
function _wireFilters() {
  const selMag   = document.getElementById('ech-filter-mag');
  const selRedac = document.getElementById('ech-filter-redac');
  if (selMag)   selMag.addEventListener('change',   e => { _filterMag   = e.target.value; render(); });
  if (selRedac) selRedac.addEventListener('change', e => { _filterRedac = e.target.value; render(); });
}

// ── CONSTRUCTION ÉCHÉANCES ────────────────────────────────────────────────────
/**
 * buildEcheances() : à partir de State.allIssues, construit un tableau plat
 * d'échéances (max 2 par numéro : deadline_redaction + deadline/bouclage).
 * Ignore les dates nulles.
 */
function buildEcheances() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];

  for (const iss of State.allIssues) {
    // Filtre rédacteur
    if (_filterRedac && iss.redacteur !== _filterRedac) continue;
    // Filtre magazine
    if (_filterMag && iss.magazine !== _filterMag) continue;

    // --- Deadline rédaction ---
    if (iss.deadline_redaction) {
      const d = _parseDate(iss.deadline_redaction);
      if (d) {
        const diffDays = Math.round((d - today) / 864e5); // positif = futur, négatif = passé
        out.push({
          magazine:  iss.magazine,
          numero:    iss.numero,
          type:      'redaction',
          date:      d,
          dateStr:   iss.deadline_redaction,
          diffDays,
          statut:    iss.statut_numero,
          redacteur: iss.redacteur,
        });
      }
    }

    // --- Deadline bouclage ---
    if (iss.deadline) {
      const d = _parseDate(iss.deadline);
      if (d) {
        const diffDays = Math.round((d - today) / 864e5);
        out.push({
          magazine:  iss.magazine,
          numero:    iss.numero,
          type:      'bouclage',
          date:      d,
          dateStr:   iss.deadline,
          diffDays,
          statut:    iss.statut_numero,
          redacteur: iss.redacteur,
        });
      }
    }
  }

  // Tri chronologique croissant
  out.sort((a, b) => a.date - b.date);
  return out;
}

function _parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// ── STATUTS « TERMINÉS » pour groupement ─────────────────────────────────────
const STATUTS_DONE_SET = new Set(['Bouclé', 'Déposé', 'Publié', 'Paru', 'Annulé', 'Stand By/Bloqué/Décalé']);

// ── GROUPEMENT PAR HORIZON ────────────────────────────────────────────────────
const GROUPS = [
  // En retard actif : passé ET numéro pas encore terminé
  { id: 'overdue', label: 'En retard',      modifier: 'overdue', test: e => e.diffDays <  0 && !STATUTS_DONE_SET.has(e.statut) },
  { id: 'today',   label: 'Aujourd\'hui',   modifier: 'today',   test: e => e.diffDays === 0 },
  { id: 'week',    label: 'Cette semaine',  modifier: 'week',    test: e => e.diffDays > 0 && e.diffDays <= 7 },
  { id: 'month',   label: 'Ce mois',        modifier: 'month',   test: e => e.diffDays > 7 && e.diffDays <= 31 },
  { id: 'later',   label: 'Plus tard',      modifier: 'later',   test: e => e.diffDays > 31 },
  // Passé + bouclé/annulé : regroupé à la fin pour info
  { id: 'archived', label: 'Passé – bouclé / annulé', modifier: 'archived', test: e => e.diffDays < 0 && STATUTS_DONE_SET.has(e.statut) },
];

function groupEcheances(list) {
  const result = {};
  for (const g of GROUPS) result[g.id] = [];
  for (const e of list) {
    const grp = GROUPS.find(g => g.test(e));
    if (grp) result[grp.id].push(e);
  }
  return result;
}

// ── RENDER ─────────────────────────────────────────────────────────────────────
function render() {
  if (!_mounted) return;

  const all     = buildEcheances();
  const grouped = groupEcheances(all);

  // -- KPIs --
  const nOverdue = grouped.overdue.length;   // actifs seulement
  const nWeek    = grouped.week.length + grouped.today.length;
  const nTotal   = all.length;
  _renderKpis(nOverdue, nWeek, nTotal);

  // -- Groupes --
  const container = document.getElementById('ech-groups');
  if (!container) return;

  if (all.length === 0) {
    container.innerHTML = `<div class="ech-empty">Aucune échéance trouvée pour les filtres sélectionnés.</div>`;
    return;
  }

  let html = '';
  for (const grp of GROUPS) {
    const items = grouped[grp.id];
    if (!items.length) continue;
    html += _buildGroup(grp, items);
  }
  container.innerHTML = html;

  // Wire clics sur chaque carte
  container.querySelectorAll('.ech-item[data-mag][data-num]').forEach(card => {
    card.addEventListener('click', () => {
      const mag = card.dataset.mag;
      const num = card.dataset.num;
      State.setCurrentMag(mag);
      State.setCurrentNum(num);
      window.PP_navigate('articles');
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function _renderKpis(nOverdue, nWeek, nTotal) {
  const bar = document.getElementById('ech-alert-bar');
  if (!bar) return;

  bar.innerHTML = `
    <div class="ech-kpi ech-kpi-danger">
      <div class="ech-kpi-icon">⚠️</div>
      <div class="ech-kpi-body">
        <span class="ech-kpi-value">${nOverdue}</span>
        <span class="ech-kpi-label">En retard</span>
      </div>
    </div>
    <div class="ech-kpi ech-kpi-warning">
      <div class="ech-kpi-icon">⏰</div>
      <div class="ech-kpi-body">
        <span class="ech-kpi-value">${nWeek}</span>
        <span class="ech-kpi-label">Aujourd'hui + cette semaine</span>
      </div>
    </div>
    <div class="ech-kpi ech-kpi-info">
      <div class="ech-kpi-icon">📋</div>
      <div class="ech-kpi-body">
        <span class="ech-kpi-value">${nTotal}</span>
        <span class="ech-kpi-label">Échéances au total</span>
      </div>
    </div>
  `;
}

// ── GROUPE HTML ───────────────────────────────────────────────────────────────
function _buildGroup(grp, items) {
  const itemsHtml = items.map(e => _buildItem(e)).join('');
  return `
    <div class="ech-group ech-group--${grp.modifier}">
      <div class="ech-group-header">
        <span class="ech-group-label">${grp.label}</span>
        <span class="ech-group-count">${items.length}</span>
        <div class="ech-group-line"></div>
      </div>
      <div class="ech-list">
        ${itemsHtml}
      </div>
    </div>
  `;
}

// ── CARTE ÉCHÉANCE ─────────────────────────────────────────────────────────────
function _buildItem(e) {
  // Numéro déjà terminé/annulé → on atténue visuellement
  const isDone = STATUTS_DONE_SET.has(e.statut);

  // Urgence visuelle
  let urgClass    = 'ech-item--normal';
  let cdClass     = 'ech-countdown--normal';
  let cdLabel     = '';

  if (e.diffDays < 0 && !isDone) {
    urgClass = 'ech-item--overdue';
    cdClass  = 'ech-countdown--overdue';
    cdLabel  = `En retard de ${Math.abs(e.diffDays)} j`;
  } else if (e.diffDays < 0 && isDone) {
    // Passé mais bouclé : neutre + mention bouclé
    cdClass = 'ech-countdown--normal';
    cdLabel = `${Math.abs(e.diffDays)} j passés`;
  } else if (e.diffDays === 0) {
    urgClass = 'ech-item--today';
    cdClass  = 'ech-countdown--today';
    cdLabel  = 'Aujourd\'hui';
  } else if (e.diffDays <= 3) {
    urgClass = 'ech-item--soon';
    cdClass  = 'ech-countdown--soon';
    cdLabel  = `Dans ${e.diffDays} j`;
  } else {
    cdLabel  = `Dans ${e.diffDays} j`;
  }

  // Pastille type
  const typeLabel = e.type === 'redaction' ? 'Rédaction' : 'Bouclage';
  const typeCls   = e.type === 'redaction' ? 'ech-type-pill--redaction' : 'ech-type-pill--bouclage';

  // Rédacteur
  const color = redacColor(e.redacteur);
  const redacHtml = e.redacteur
    ? `<span class="ech-redac-badge">
         <span class="ech-redac-dot" style="background:${esc(color || '#888')}"></span>
         ${esc(e.redacteur)}
       </span>`
    : '';

  // Statut
  const statutCls  = statNumClass(e.statut);
  const statutHtml = e.statut
    ? `<span class="pill ${statutCls} ech-item-statut">${esc(e.statut)}</span>`
    : '';

  // Date affichée
  const dateDisplay = fmtDate(e.dateStr);

  // Titre : magazine + numéro
  const numLabel = e.numero && e.numero !== '—' ? ` N°${esc(e.numero)}` : '';
  const title    = `${esc(e.magazine)}${numLabel}`;

  return `
    <button class="ech-item ${urgClass}"
            data-mag="${esc(e.magazine)}"
            data-num="${esc(e.numero || '')}"
            title="Voir les articles de ${esc(e.magazine)}${numLabel}"
            tabindex="0"
            role="button">
      <div class="ech-item-main">
        <div class="ech-item-top">
          <span class="ech-type-pill ${typeCls}">${typeLabel}</span>
          <span class="ech-item-title">${title}</span>
        </div>
        <div class="ech-item-meta">
          ${statutHtml}
          ${redacHtml}
        </div>
      </div>
      <div class="ech-item-date-col">
        <span class="ech-date-display">${esc(dateDisplay)}</span>
        <span class="ech-countdown ${cdClass}">${esc(cdLabel)}</span>
      </div>
      <span class="ech-item-arrow" aria-hidden="true">→</span>
    </button>
  `;
}
