/* PressPilot V2 — billing.js
   Module: Facturation.
   Exposes mount(container) / unmount(). */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, statNumClass, fmtMonth, toYMD, startOfToday, PRICING, SOMMAIRE_FEE } from './helpers.js';

let _mounted = false;
let _modalSetup = false;

export function mount(container) {
  _mounted = true;
  container.innerHTML = buildHTML();
  setupBillingButton();
  loadBilling();
}
export function unmount() {
  _mounted = false;
}

function buildHTML() {
  return `<div class="numeros-wrap">
    <div class="numeros-header">
      <h2 class="dash-title">Facturation</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary btn-sm" id="btn-add-billing">+ Nouveau mois</button>
      </div>
    </div>
    <div id="billing-body"></div>
  </div>
  <!-- Modals -->
  <div id="modal-add-billing-line" class="modal-overlay" style="display:none">
    <div class="modal" style="width:540px">
      <h3>Ajouter des magazines</h3>
      <input type="hidden" id="billing-line-month">
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div class="modal-field-label">Magazines existants</div>
          <div id="billing-issues-checklist" class="billing-checklist"></div>
        </div>
        <div class="modal-divider"></div>
        <div>
          <div class="modal-field-label">Ajout manuel</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div>
              <label style="font-size:11px;color:var(--ink-soft);display:block;margin-bottom:2px">Nom du magazine</label>
              <input type="text" id="billing-manual-name" placeholder="ex: Voici" style="width:180px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--ink-soft);display:block;margin-bottom:2px">Format</label>
              <select id="billing-manual-format" style="width:80px">
                <option value="">—</option>
                ${Object.keys(PRICING).map(p=>`<option>${p}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--ink-soft);display:block;margin-bottom:2px">Prix (optionnel)</label>
              <input type="number" id="billing-manual-price" placeholder="€" style="width:70px" min="0">
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-billing-line-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-billing-line-confirm">Ajouter</button>
      </div>
    </div>
  </div>
  <div id="modal-add-payment" class="modal-overlay" style="display:none">
    <div class="modal" style="width:380px">
      <h3>Enregistrer un paiement</h3>
      <input type="hidden" id="payment-month">
      <div style="display:flex;flex-direction:column;gap:14px">
        <label>
          <span style="display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;color:var(--ink-soft)">Montant (€)</span>
          <input type="number" id="payment-amount" style="width:100%" placeholder="ex: 400" min="0" step="0.01">
        </label>
        <label>
          <span style="display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;color:var(--ink-soft)">Date</span>
          <input type="date" id="payment-date" style="width:100%">
        </label>
        <label>
          <span style="display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;color:var(--ink-soft)">Note (optionnel)</span>
          <input type="text" id="payment-notes" style="width:100%">
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-payment-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-payment-confirm">Enregistrer</button>
      </div>
    </div>
  </div>`;
}

async function loadBilling() {
  State.setBillingData(await API.getBilling());
  renderBilling(State.billingData);
  if (!_modalSetup) { setupBillingModals(); _modalSetup = true; }
}

function setupBillingButton() {
  document.getElementById('btn-add-billing')?.addEventListener('click', async () => {
    const month = prompt('Mois de facturation (format YYYY-MM) :', new Date().toISOString().slice(0,7));
    if (!month?.match(/^\d{4}-\d{2}$/)) { if(month) alert('Format invalide. Utilise YYYY-MM (ex: 2026-06)'); return; }
    await API.postBillingMonth({ month });
    loadBilling();
  });
}

function renderBilling(data) {
  const body = document.getElementById('billing-body');
  if (!body) return;
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
      await API.deleteBillingLine(btn.dataset.delLine);
      loadBilling();
    });
  });
  body.querySelectorAll('[data-del-pay]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce paiement ?')) return;
      await API.deleteBillingPayment(btn.dataset.delPay);
      loadBilling();
    });
  });
  body.querySelectorAll('[data-del-month]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce mois et toutes ses données ?')) return;
      await API.deleteBillingMonth(btn.dataset.delMonth);
      loadBilling();
    });
  });
  body.querySelectorAll('.billing-price-edit').forEach(inp => {
    inp.addEventListener('change', async () => {
      const val = inp.value !== '' ? Number(inp.value) : null;
      await API.patchBillingLine(inp.dataset.lineId, { price_override: val });
      loadBilling();
    });
  });
  body.querySelectorAll('.billing-standby-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      await API.patchBillingLine(cb.dataset.lineId, { standby: cb.checked ? 1 : 0 });
      loadBilling();
    });
  });
  body.querySelectorAll('.billing-pay-edit').forEach(inp => {
    inp.addEventListener('change', async () => {
      const field = inp.dataset.payField;
      const val = field === 'amount' ? (inp.value ? Number(inp.value) : null) : (inp.value || null);
      if (field === 'amount' && !val) return;
      await API.patchBillingPayment(inp.dataset.payId, { [field]: val });
      loadBilling();
    });
  });
}

function renderBillingMonth(m) {
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
      <td style="color:var(--text-muted)">${esc(fmt||'—')}</td>
      <td><input type="number" class="billing-price-edit" data-line-id="${line.id}" value="${displayPrice||''}" placeholder="—" style="width:65px;text-align:right;background:transparent;border:1px solid transparent;border-radius:3px" onfocus="this.style.border='1px solid var(--border)'" onblur="this.style.border='1px solid transparent'"></td>
      <td style="text-align:center"><input type="checkbox" class="billing-standby-cb" data-line-id="${line.id}" ${line.standby?'checked':''} title="En attente — exclu du total facturé"></td>
      <td><button class="btn-icon" data-del-line="${line.id}">🗑</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="color:var(--text-muted);font-style:italic;padding:8px 12px">Aucun magazine</td></tr>`;

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
  ).join('') : `<div style="color:var(--text-muted);font-style:italic;font-size:11px">Aucun paiement enregistré</div>`;

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
  const alreadyAdded = new Set(State.billingData.flatMap(md => (md.lines || []).map(l => l.issue_id)).filter(Boolean));
  const available = State.allIssues.filter(i => !alreadyAdded.has(i.id) && !/annulé/i.test(i.statut_numero || ''));
  const checklist = document.getElementById('billing-issues-checklist');
  if (!available.length) {
    checklist.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">Tous les magazines sont déjà ajoutés pour ce mois.</div>';
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
  document.getElementById('btn-billing-line-cancel')?.addEventListener('click', () => { document.getElementById('modal-add-billing-line').style.display='none'; });
  document.getElementById('btn-billing-line-confirm')?.addEventListener('click', async () => {
    const month = document.getElementById('billing-line-month').value;
    const checkedCbs = [...document.querySelectorAll('.billing-issue-cb:checked')];
    const manualName   = document.getElementById('billing-manual-name').value.trim();
    const manualFormat = document.getElementById('billing-manual-format').value;
    const manualPrice  = document.getElementById('billing-manual-price').value;
    if (!checkedCbs.length && !manualName) { alert('Sélectionne au moins un magazine ou entre un nom manuellement.'); return; }
    const promises = checkedCbs.map(cb => API.postBillingLine({ month, issue_id: Number(cb.value) }));
    if (manualName) {
      promises.push(API.postBillingLine({ month, manual_magazine: manualName, manual_format: manualFormat||null, price_override: manualPrice ? Number(manualPrice) : null }));
    }
    await Promise.all(promises);
    document.getElementById('modal-add-billing-line').style.display='none';
    loadBilling();
  });
  document.getElementById('modal-add-billing-line')?.addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
  document.getElementById('btn-payment-cancel')?.addEventListener('click', () => { document.getElementById('modal-add-payment').style.display='none'; });
  document.getElementById('btn-payment-confirm')?.addEventListener('click', async () => {
    const month  = document.getElementById('payment-month').value;
    const amount = document.getElementById('payment-amount').value;
    if (!amount) return;
    const date  = document.getElementById('payment-date').value;
    const notes = document.getElementById('payment-notes').value;
    await API.postBillingPayment({ month, amount:Number(amount), date:date||null, notes:notes||null });
    document.getElementById('modal-add-payment').style.display='none';
    loadBilling();
  });
  document.getElementById('modal-add-payment')?.addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
}
