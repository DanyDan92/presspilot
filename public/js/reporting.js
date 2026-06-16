/* PressPilot V2 — reporting.js
   Module: Reporting / Analytics.
   READ-ONLY — ne modifie aucune donnée.
   Exposes mount(container) / unmount().

   Métriques :
   1. Production par mois  — nb numéros par mois (deadline issues)
   2. Production par magazine — nb articles + nb numéros, barres horiz
   3. Taux de bouclage — donut statuts numéros + % articles Done
   4. Délais rédac→bouclage — delta deadline_redaction→deadline (jours)
   5. CA / Facturation — revenu par mois + total, depuis /api/billing */

import * as API from './api.js';
import { esc, fmtMonth, PRICING, SOMMAIRE_FEE } from './helpers.js';

let _mounted = false;

// ── STATUTS « BOUCLÉ » ───────────────────────────────────────────────────────
const STATUTS_BOUCLE = new Set(['Bouclé', 'Déposé', 'Publié', 'Paru']);
const STATUTS_ENCOURS = new Set(['En cours de rédaction', 'Rédaction', 'En préparation']);
const STATUTS_AVENIR  = new Set(['A venir']);
const STATUTS_STANDBY = new Set(['Annulé', 'Stand By/Bloqué/Décalé']);

// ── MOUNT / UNMOUNT ──────────────────────────────────────────────────────────
export function mount(container) {
  _mounted = true;
  container.innerHTML = buildShell();
  loadAndRender();
}
export function unmount() {
  _mounted = false;
}

// ── SHELL ────────────────────────────────────────────────────────────────────
function buildShell() {
  return `<div class="reporting-wrap">
    <div class="reporting-page-header">
      <div>
        <p class="reporting-eyebrow">Analytics</p>
        <h2 class="reporting-title">Reporting</h2>
        <p class="reporting-subtitle">Vue d'ensemble de la production éditoriale. Lecture seule.</p>
      </div>
    </div>
    <div id="rep-filters" class="reporting-filters" style="display:none">
      <span class="reporting-filter-label">Magazine</span>
      <select id="rep-filter-mag">
        <option value="">Tous les magazines</option>
      </select>
      <span class="reporting-filter-label" style="margin-left:var(--space-2)">Période</span>
      <select id="rep-filter-period">
        <option value="">Toutes les périodes</option>
      </select>
    </div>
    <div id="rep-kpis" class="reporting-kpis">
      <div class="rep-loading" style="grid-column:1/-1">Chargement…</div>
    </div>
    <div id="rep-body"></div>
  </div>`;
}

// ── LOAD DATA + RENDER ───────────────────────────────────────────────────────
async function loadAndRender() {
  if (!_mounted) return;

  try {
    // Fetch all 3 endpoints in parallel
    const [articles, issues, billing] = await Promise.all([
      API.getArticles({}),
      API.getIssues(),
      API.getBilling(),
    ]);

    if (!_mounted) return;
    renderAll({ articles, issues, billing });
  } catch (e) {
    console.error('[Reporting] load error', e);
    const body = document.getElementById('rep-body');
    if (body) body.innerHTML = `<div class="rep-empty">Erreur lors du chargement des données.</div>`;
  }
}

// ── MAIN RENDER ──────────────────────────────────────────────────────────────
function renderAll({ articles, issues, billing }) {
  // ── 1. KPIs globaux ──────────────────────────────────────────────────────
  const totalArticles = articles.length;
  const totalIssues   = issues.length;

  // Bouclage global : numéros avec statut "bouclé/déposé/publié/paru"
  const boucled = issues.filter(i => STATUTS_BOUCLE.has(i.statut_numero));
  const tauxBouclage = totalIssues > 0 ? Math.round(boucled.length / totalIssues * 100) : 0;

  // CA total (tous mois confondus, billing)
  const caTotal  = billing.reduce((s, m) => s + (m.total_billed || 0), 0);
  const caPaid   = billing.reduce((s, m) => s + (m.total_paid  || 0), 0);
  const caBalance= caTotal - caPaid;

  const kpis = document.getElementById('rep-kpis');
  if (kpis) {
    kpis.innerHTML = `
      <div class="rep-kpi rep-kpi-copper">
        <span class="rep-kpi-label">Articles total</span>
        <span class="rep-kpi-value">${totalArticles}</span>
        <span class="rep-kpi-meta">Sur ${totalIssues} numéro${totalIssues !== 1 ? 's' : ''}</span>
      </div>
      <div class="rep-kpi rep-kpi-success">
        <span class="rep-kpi-label">Numéros bouclés</span>
        <span class="rep-kpi-value">${boucled.length}</span>
        <span class="rep-kpi-meta">/${totalIssues} numéros (${tauxBouclage}%)</span>
      </div>
      <div class="rep-kpi rep-kpi-info">
        <span class="rep-kpi-label">CA facturé total</span>
        <span class="rep-kpi-value">${caTotal.toLocaleString('fr-FR')}€</span>
        <span class="rep-kpi-meta">Reçu ${caPaid.toLocaleString('fr-FR')}€${caBalance > 0 ? ' · Reste ' + caBalance.toLocaleString('fr-FR') + '€' : ''}</span>
      </div>
      <div class="rep-kpi rep-kpi-warning">
        <span class="rep-kpi-label">Articles Done</span>
        <span class="rep-kpi-value">${articles.filter(a => a.status === 'Done').length}</span>
        <span class="rep-kpi-meta">${totalArticles > 0 ? Math.round(articles.filter(a => a.status === 'Done').length / totalArticles * 100) : 0}% du total</span>
      </div>
    `;
  }

  // ── 2. Body sections ──────────────────────────────────────────────────────
  const body = document.getElementById('rep-body');
  if (!body) return;

  body.innerHTML = `
    <div class="reporting-grid-wide">
      ${buildProductionParMois(issues)}
      ${buildBouclageDonut(issues)}
    </div>
    <div class="reporting-grid">
      ${buildProductionParMag(articles, issues)}
      ${buildDelais(issues)}
    </div>
    <div class="reporting-grid">
      ${buildCASection(billing)}
      ${buildStatutArticles(articles)}
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Production par mois (numéros, par deadline)
// Choix : on utilise `deadline` des issues (date de bouclage prévue).
// Pourquoi : created_at des articles est toutes en 2026-06 (import batch),
// la deadline des numéros reflète mieux la temporalité éditoriale réelle.
// ────────────────────────────────────────────────────────────────────────────
function buildProductionParMois(issues) {
  // Group issues by deadline month
  const byMonth = {};
  for (const iss of issues) {
    const m = iss.deadline ? iss.deadline.slice(0, 7) : null;
    if (!m) continue;
    if (!byMonth[m]) byMonth[m] = { issues: 0, boucled: 0 };
    byMonth[m].issues++;
    if (STATUTS_BOUCLE.has(iss.statut_numero)) byMonth[m].boucled++;
  }

  const months = Object.keys(byMonth).sort();
  if (!months.length) {
    return `<div class="rep-card"><div class="rep-card-title">Production par mois</div><div class="rep-empty">Aucune donnée</div></div>`;
  }

  const maxVal = Math.max(...months.map(m => byMonth[m].issues));
  // SVG bar chart
  const W = 480, H = 140, PAD_L = 28, PAD_B = 36, PAD_T = 10, PAD_R = 12;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const barW   = Math.min(40, Math.floor(chartW / months.length) - 4);
  const barGap = (chartW - barW * months.length) / (months.length + 1);

  let bars = '', labels = '', boucledBars = '';
  months.forEach((m, idx) => {
    const d = byMonth[m];
    const x = PAD_L + barGap + idx * (barW + barGap);
    const barH = maxVal > 0 ? Math.round(d.issues / maxVal * chartH) : 0;
    const bH   = maxVal > 0 ? Math.round(d.boucled / maxVal * chartH) : 0;
    const y    = PAD_T + chartH - barH;
    const yB   = PAD_T + chartH - bH;

    // Background bar (total)
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="var(--paper-2)" rx="3"/>`;
    // Foreground bar (bouclé)
    if (bH > 0) boucledBars += `<rect x="${x}" y="${yB}" width="${barW}" height="${bH}" fill="var(--copper)" rx="3" opacity=".85"/>`;

    // Value label
    bars += `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="var(--ink)" font-family="var(--font-sans)" font-weight="600">${d.issues}</text>`;

    // Month label
    const shortM = m.slice(5, 7) + '/' + m.slice(2, 4);
    labels += `<text x="${x + barW / 2}" y="${H - 4}" text-anchor="middle" font-size="9" fill="var(--text-muted)" font-family="var(--font-sans)">${shortM}</text>`;
  });

  // Y axis lines
  let yLines = '';
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const val  = Math.round(maxVal * s / steps);
    const yPos = PAD_T + chartH - (maxVal > 0 ? Math.round(val / maxVal * chartH) : 0);
    yLines += `<line x1="${PAD_L}" y1="${yPos}" x2="${W - PAD_R}" y2="${yPos}" stroke="var(--border)" stroke-width="1"/>`;
    if (s > 0) yLines += `<text x="${PAD_L - 4}" y="${yPos + 3}" text-anchor="end" font-size="8" fill="var(--text-muted)" font-family="var(--font-sans)">${val}</text>`;
  }

  return `<div class="rep-card">
    <div class="rep-card-title">
      Production par mois
      <span class="rep-card-subtitle">par deadline numéro</span>
    </div>
    <div class="rep-chart-wrap">
      <svg class="rep-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${yLines}
        ${bars}
        ${boucledBars}
        ${labels}
      </svg>
    </div>
    <div style="display:flex;gap:var(--space-4);margin-top:var(--space-2)">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="display:inline-block;width:10px;height:10px;background:var(--paper-2);border:1px solid var(--border);border-radius:2px"></span>
        <span style="font-size:var(--text-xs);color:var(--text-muted)">Total numéros</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="display:inline-block;width:10px;height:10px;background:var(--copper);border-radius:2px;opacity:.85"></span>
        <span style="font-size:var(--text-xs);color:var(--text-muted)">Bouclés</span>
      </div>
    </div>
  </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Donut taux de bouclage
// ────────────────────────────────────────────────────────────────────────────
function buildBouclageDonut(issues) {
  const total   = issues.length;
  if (!total) {
    return `<div class="rep-card"><div class="rep-card-title">Taux de bouclage</div><div class="rep-empty">Aucun numéro</div></div>`;
  }

  const segments = [
    { label: 'Bouclé / Déposé', count: 0, color: 'var(--success)' },
    { label: 'En cours',        count: 0, color: 'var(--copper)' },
    { label: 'A venir',         count: 0, color: 'var(--info)' },
    { label: 'Standby / Annulé',count: 0, color: 'var(--border-strong)' },
    { label: 'Autre',           count: 0, color: 'var(--paper-2)' },
  ];

  for (const iss of issues) {
    const s = iss.statut_numero || '';
    if (STATUTS_BOUCLE.has(s))  segments[0].count++;
    else if (STATUTS_ENCOURS.has(s)) segments[1].count++;
    else if (STATUTS_AVENIR.has(s))  segments[2].count++;
    else if (STATUTS_STANDBY.has(s)) segments[3].count++;
    else                              segments[4].count++;
  }

  // SVG donut
  const R = 52, r = 30, cx = 60, cy = 60;
  const TAU = 2 * Math.PI;

  function polarToCart(angle, radius) {
    return [cx + radius * Math.cos(angle - Math.PI / 2), cy + radius * Math.sin(angle - Math.PI / 2)];
  }

  function arcPath(startAngle, endAngle, outerR, innerR) {
    const o1 = polarToCart(startAngle, outerR);
    const o2 = polarToCart(endAngle,   outerR);
    const i1 = polarToCart(endAngle,   innerR);
    const i2 = polarToCart(startAngle, innerR);
    const large = (endAngle - startAngle) > Math.PI ? 1 : 0;
    return `M ${o1.join(' ')} A ${outerR} ${outerR} 0 ${large} 1 ${o2.join(' ')} L ${i1.join(' ')} A ${innerR} ${innerR} 0 ${large} 0 ${i2.join(' ')} Z`;
  }

  let paths = '';
  let angle = 0;
  const gap = 0.02; // gap between segments in radians
  for (const seg of segments) {
    if (!seg.count) continue;
    const sweep = (seg.count / total) * TAU;
    const startA = angle + gap / 2;
    const endA   = angle + sweep - gap / 2;
    if (endA > startA) {
      // Replace CSS var with inline color for SVG (vars don't always work in SVG paths)
      paths += `<path d="${arcPath(startA, endA, R, r)}" fill="${seg.color}" class="rep-donut-segment"/>`;
    }
    angle += sweep;
  }

  // Center text
  const tauxPct = Math.round(segments[0].count / total * 100);
  const centerText = `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)" font-family="var(--font-sans)">${tauxPct}%</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="8" fill="var(--text-muted)" font-family="var(--font-sans)">bouclé</text>`;

  const legendItems = segments.filter(s => s.count > 0).map(s => `
    <div class="rep-donut-legend-item">
      <span class="rep-donut-swatch" style="background:${s.color}"></span>
      <span class="rep-donut-legend-label">${esc(s.label)}</span>
      <span class="rep-donut-legend-val">${s.count}</span>
    </div>
  `).join('');

  return `<div class="rep-card">
    <div class="rep-card-title">
      Taux de bouclage
      <span class="rep-card-subtitle">${total} numéros</span>
    </div>
    <div class="rep-donut-wrap">
      <svg class="rep-donut-svg" viewBox="0 0 120 120" width="120" height="120">
        ${paths}
        ${centerText}
      </svg>
      <div class="rep-donut-legend">${legendItems}</div>
    </div>
  </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Production par magazine (articles + numéros)
// ────────────────────────────────────────────────────────────────────────────
function buildProductionParMag(articles, issues) {
  // Count articles per magazine
  const artByMag = {};
  for (const a of articles) {
    if (!a.magazine) continue;
    artByMag[a.magazine] = (artByMag[a.magazine] || 0) + 1;
  }

  // Count issues per magazine
  const issuesByMag = {};
  for (const i of issues) {
    issuesByMag[i.magazine] = (issuesByMag[i.magazine] || 0) + 1;
  }

  // Merge and sort by article count
  const mags = [...new Set([...Object.keys(artByMag), ...Object.keys(issuesByMag)])]
    .map(m => ({ mag: m, articles: artByMag[m] || 0, issues: issuesByMag[m] || 0 }))
    .sort((a, b) => b.articles - a.articles);

  if (!mags.length) {
    return `<div class="rep-card"><div class="rep-card-title">Par magazine</div><div class="rep-empty">Aucune donnée</div></div>`;
  }

  const maxArt = mags[0].articles;

  const items = mags.map(m => {
    const pct = maxArt > 0 ? Math.round(m.articles / maxArt * 100) : 0;
    return `<div class="rep-hbar-item">
      <div class="rep-hbar-row">
        <span class="rep-hbar-label" title="${esc(m.mag)}">${esc(m.mag)}</span>
        <div class="rep-hbar-track">
          <div class="rep-hbar-fill" style="width:${pct}%"></div>
        </div>
        <span class="rep-hbar-val">${m.articles}</span>
      </div>
      <div class="rep-hbar-sub">${m.issues} numéro${m.issues !== 1 ? 's' : ''}</div>
    </div>`;
  }).join('');

  return `<div class="rep-card">
    <div class="rep-card-title">
      Par magazine
      <span class="rep-card-subtitle">articles (barres) · numéros</span>
    </div>
    <div class="rep-hbar-list">${items}</div>
  </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Délais rédaction → bouclage
// Calcul : deadline - deadline_redaction (jours).
// On filtre les issues avec les deux dates renseignées.
// Honnêteté : on n'exclut pas les numéros non bouclés (la deadline est prévue)
// mais on indique l'échantillon.
// ────────────────────────────────────────────────────────────────────────────
function buildDelais(issues) {
  const withDates = issues
    .filter(i => i.deadline_redaction && i.deadline)
    .map(i => {
      const dr   = new Date(i.deadline_redaction);
      const dl   = new Date(i.deadline);
      const days = Math.round((dl - dr) / (1000 * 60 * 60 * 24));
      return { ...i, days: isNaN(days) ? null : days };
    })
    .filter(i => i.days !== null)
    .sort((a, b) => b.days - a.days);

  if (!withDates.length) {
    return `<div class="rep-card"><div class="rep-card-title">Délais rédac → bouclage</div><div class="rep-empty">Aucune deadline_redaction renseignée</div></div>`;
  }

  const avg = Math.round(withDates.reduce((s, i) => s + i.days, 0) / withDates.length);
  const maxDays = withDates[0].days;

  const rows = withDates.map(i => {
    const pct = maxDays > 0 ? Math.round(i.days / maxDays * 100) : 0;
    return `<div class="rep-delay-row">
      <span class="rep-delay-mag" title="${esc(i.magazine)} N°${esc(i.numero)}">${esc(i.magazine)}</span>
      <div class="rep-delay-bar"><div class="rep-delay-bar-fill" style="width:${pct}%"></div></div>
      <span class="rep-delay-days">${i.days}j</span>
    </div>`;
  }).join('');

  return `<div class="rep-card">
    <div class="rep-card-title">
      Délais rédac → bouclage
      <span class="rep-card-subtitle">n=${withDates.length}</span>
    </div>
    <div class="rep-delay-list">${rows}</div>
    <div class="rep-delay-avg">
      Délai moyen : <strong>${avg} jour${avg !== 1 ? 's' : ''}</strong> (sur ${withDates.length} numéro${withDates.length !== 1 ? 's' : ''})
    </div>
    <p class="rep-note">Délai = deadline - deadline_rédaction (planifié, pas mesuré). Toutes les deadlines sont renseignées ici.</p>
  </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 5 — CA / Facturation
// Logique identique à billing.js : total_billed inclut SOMMAIRE_FEE × lignes
// actives (non-standby). Le calcul est fait côté serveur dans /api/billing.
// ────────────────────────────────────────────────────────────────────────────
function buildCASection(billing) {
  if (!billing.length) {
    return `<div class="rep-card"><div class="rep-card-title">CA / Facturation</div><div class="rep-empty">Aucun mois de facturation</div></div>`;
  }

  const sorted   = [...billing].sort((a, b) => a.month.localeCompare(b.month));
  const maxBill  = Math.max(...sorted.map(m => m.total_billed));
  const caTotal  = billing.reduce((s, m) => s + m.total_billed, 0);
  const caPaid   = billing.reduce((s, m) => s + m.total_paid, 0);
  const caReste  = caTotal - caPaid;

  const rows = sorted.map(m => {
    const pct     = maxBill > 0 ? Math.round(m.total_billed / maxBill * 100) : 0;
    const balance = Math.round((m.total_paid - m.total_billed) * 100) / 100;
    const balClass = balance >= 0 ? 'ok' : 'due';
    const balStr  = balance >= 0 ? `+${balance}€` : `${balance}€`;
    return `<div class="rep-ca-month-row">
      <span class="rep-ca-month-label">${fmtMonth(m.month).replace(' ', '&nbsp;')}</span>
      <div class="rep-ca-track">
        <div class="rep-ca-fill${m.total_paid < m.total_billed ? ' rep-ca-fill-partial' : ''}" style="width:${pct}%"></div>
      </div>
      <span class="rep-ca-val">${m.total_billed.toLocaleString('fr-FR')}€</span>
      <span class="rep-ca-bal ${balClass}">${balStr}</span>
    </div>`;
  }).join('');

  return `<div class="rep-card">
    <div class="rep-card-title">
      CA / Facturation
      <span class="rep-card-subtitle">depuis /api/billing</span>
    </div>
    <div class="rep-ca-months">${rows}</div>
    <div class="rep-ca-total">
      <div class="rep-ca-total-item">
        <span class="rep-ca-total-label">Facturé</span>
        <span class="rep-ca-total-value">${caTotal.toLocaleString('fr-FR')}€</span>
      </div>
      <div class="rep-ca-total-item">
        <span class="rep-ca-total-label">Reçu</span>
        <span class="rep-ca-total-value">${caPaid.toLocaleString('fr-FR')}€</span>
      </div>
      <div class="rep-ca-total-item">
        <span class="rep-ca-total-label">Reste à payer</span>
        <span class="rep-ca-total-value" style="color:${caReste > 0 ? 'var(--danger)' : 'var(--success)'}">${caReste.toLocaleString('fr-FR')}€</span>
      </div>
    </div>
    <p class="rep-note">CA = prix magazine (selon format ou prix custom) + ${SOMMAIRE_FEE}€ sommaire/magazine actif.</p>
  </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Répartition statuts articles (bonus)
// ────────────────────────────────────────────────────────────────────────────
function buildStatutArticles(articles) {
  if (!articles.length) {
    return `<div class="rep-card"><div class="rep-card-title">Statuts articles</div><div class="rep-empty">Aucun article</div></div>`;
  }

  const counts = {};
  for (const a of articles) {
    const s = a.status || 'N/A';
    counts[s] = (counts[s] || 0) + 1;
  }

  // Order by importance
  const ORDER = ['Done', 'Done but not sure', 'In progress', 'Fact-check', 'ReWork', 'Sujet à revoir', 'A faire', 'Not started', 'Stand by', 'Trop court', 'Problème'];
  const all = Object.keys(counts).sort((a, b) => {
    const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const total   = articles.length;
  const maxCount = Math.max(...Object.values(counts));

  const STATUS_COLOR = {
    'Done': 'var(--success)',
    'Done but not sure': 'var(--success)',
    'In progress': 'var(--info)',
    'Fact-check': 'var(--info)',
    'ReWork': 'var(--warning)',
    'Sujet à revoir': 'var(--warning)',
    'Trop court': 'var(--warning)',
    'A faire': 'var(--border-strong)',
    'Not started': 'var(--border-strong)',
    'Stand by': 'var(--border-strong)',
    'Problème': 'var(--danger)',
  };

  const items = all.map(s => {
    const cnt  = counts[s];
    const pct  = total > 0 ? Math.round(cnt / total * 100) : 0;
    const trackPct = maxCount > 0 ? Math.round(cnt / maxCount * 100) : 0;
    const color = STATUS_COLOR[s] || 'var(--border-strong)';
    return `<div class="rep-hbar-item">
      <div class="rep-hbar-row">
        <span class="rep-hbar-label" title="${esc(s)}">${esc(s)}</span>
        <div class="rep-hbar-track">
          <div class="rep-hbar-fill" style="width:${trackPct}%;background:${color}"></div>
        </div>
        <span class="rep-hbar-val">${cnt} <span style="font-weight:400;color:var(--text-muted);font-size:10px">(${pct}%)</span></span>
      </div>
    </div>`;
  }).join('');

  return `<div class="rep-card">
    <div class="rep-card-title">
      Répartition statuts articles
      <span class="rep-card-subtitle">${total} articles</span>
    </div>
    <div class="rep-hbar-list">${items}</div>
  </div>`;
}
