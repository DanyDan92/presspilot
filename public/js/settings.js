/* PressPilot V2 — settings.js
   Module: Paramètres.
   Modèle brouillon : les changements s'accumulent en mémoire.
   Un bouton "Enregistrer" ouvre une pop-up de confirmation listant les diffs.
   Exposes mount(container) / unmount(). */

import * as State from './state.js';
import * as API   from './api.js';
import { esc } from './helpers.js';

let _mounted = false;

/* ── Libellés humains des catégories ─────────────────────────────────────── */
const CAT_LABELS = {
  type_contenu:    'Types de contenu',
  rubrique:        'Rubriques',
  format_page:     'Formats',
  statut_numero:   'Statuts numéro',
  statut_paiement: 'Statuts paiement',
};

/* ── État du brouillon ───────────────────────────────────────────────────── */
/*
  _draft = {
    [id]: { state: 'modified'|'deleted', value?, color?, origValue?, origColor?, cat? }
  }
  _added = [ { _tmpId, category, value, color } ]   (pas encore persistés)
*/
let _draft  = {};   // modifications/suppressions d'items existants
let _added  = [];   // nouveaux items (pas d'id BDD)
let _origCfg = {}; // snapshot de l'état chargé (pour Annuler)

/* ── Point d'entrée ──────────────────────────────────────────────────────── */
export function mount(container) {
  _mounted = true;
  _draft  = {};
  _added  = [];
  _origCfg = {};

  container.innerHTML = `
<div class="settings-wrap">
  <div class="settings-page-header">
    <h2 class="settings-page-title">Paramètres</h2>
    <p class="settings-page-desc">Gère les valeurs de référence utilisées dans toute l'application.</p>
  </div>

  <!-- Sauvegarde -->
  <div class="settings-backup-card">
    <div class="settings-backup-info">
      <strong>Sauvegarde des données</strong>
      <span>Télécharge un fichier JSON contenant toutes tes données (articles, magazines, facturation).</span>
    </div>
    <button class="btn btn-secondary" id="btn-backup">Télécharger la sauvegarde</button>
  </div>

  <!-- Grille des catégories -->
  <div class="settings-grid" id="settings-grid"></div>

  <!-- Barre sticky (cachée par défaut) -->
  <div class="settings-save-bar" id="settings-save-bar" style="display:none">
    <div class="settings-save-bar-left">
      <span class="settings-draft-badge">
        <span class="settings-draft-count" id="draft-count">0</span>
        modification(s) en attente
      </span>
    </div>
    <div class="settings-save-bar-actions">
      <button class="btn btn-ghost btn-sm" id="btn-discard">Annuler les modifications</button>
      <button class="btn btn-primary" id="btn-save">Enregistrer les modifications</button>
    </div>
  </div>
</div>`;

  /* Backup */
  document.getElementById('btn-backup')?.addEventListener('click', _handleBackup);

  /* Barre sticky */
  document.getElementById('btn-save')?.addEventListener('click', _openConfirmModal);
  document.getElementById('btn-discard')?.addEventListener('click', _discardDraft);

  loadSettings();
}

export function unmount() {
  _mounted = false;
}

/* ── Chargement ──────────────────────────────────────────────────────────── */
async function loadSettings() {
  const raw = await API.getConfig();
  State.setCfg(raw);
  // Deep-clone pour le snapshot "Annuler"
  _origCfg = JSON.parse(JSON.stringify(raw));
  _draft   = {};
  _added   = [];
  _renderGrid();
  _updateSaveBar();
}

/* ── Rendu de la grille ──────────────────────────────────────────────────── */
function _renderGrid() {
  const grid = document.getElementById('settings-grid');
  if (!grid) return;

  grid.innerHTML = '';

  Object.entries(State.cfg).forEach(([cat, items]) => {
    const sec = document.createElement('div');
    sec.className = 'settings-section';
    sec.dataset.cat = cat;

    sec.innerHTML = `
<div class="settings-section-hdr">
  <h3 class="settings-section-title">${esc(CAT_LABELS[cat] || cat)}</h3>
</div>
<div class="settings-section-body">
  <div class="settings-list" id="list-${cat}"></div>
  <div class="settings-add">
    <input type="text" class="add-value" placeholder="Nouvelle valeur…" aria-label="Nouvelle valeur">
    <input type="color" class="add-color" value="#EDE6D8" title="Couleur">
    <button class="btn btn-primary btn-sm add-btn" type="button">Ajouter</button>
  </div>
</div>`;

    grid.appendChild(sec);

    // Remplir la liste
    _renderList(cat, items, sec.querySelector(`#list-${cat}`));

    // Ajouter les items brouillon "added" pour cette catégorie
    _added.filter(a => a.category === cat).forEach(a => {
      _renderAddedItem(cat, a, sec.querySelector(`#list-${cat}`));
    });

    // Bouton Ajouter
    sec.querySelector('.add-btn').addEventListener('click', () => {
      const inp  = sec.querySelector('.add-value');
      const col  = sec.querySelector('.add-color');
      const val  = inp.value.trim();
      if (!val) { inp.focus(); return; }
      _addItem(cat, val, col.value, sec.querySelector(`#list-${cat}`));
      inp.value = '';
      col.value = '#EDE6D8';
    });

    // Appui Entrée dans le champ texte
    sec.querySelector('.add-value').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sec.querySelector('.add-btn').click();
      }
    });
  });
}

/* Rendu des items existants d'une liste */
function _renderList(cat, items, listEl) {
  items.forEach(item => {
    const d = _draft[item.id];
    const state = d ? d.state : null;
    const row = document.createElement('div');
    row.className = 'settings-item';
    row.dataset.id = item.id;
    if (state) row.dataset.dirty = state;

    const currentValue = (d && d.value !== undefined) ? d.value : item.value;
    const currentColor = (d && d.color !== undefined) ? d.color : (item.color || '#EDE6D8');

    if (state === 'deleted') {
      row.innerHTML = `
<input type="color" class="color-swatch" value="${esc(currentColor)}" disabled title="Couleur">
<span class="item-value" style="pointer-events:none">${esc(currentValue)}</span>
<button class="item-restore" title="Restaurer" data-id="${item.id}">↩</button>`;
      row.querySelector('.item-restore').addEventListener('click', () => {
        _restoreItem(item.id, listEl);
      });
    } else {
      row.innerHTML = `
<input type="color" class="color-swatch" value="${esc(currentColor)}" data-id="${item.id}" title="Couleur">
<span class="item-value" contenteditable="true" data-id="${item.id}" spellcheck="false">${esc(currentValue)}</span>
<button class="item-del" title="Supprimer" data-id="${item.id}" type="button">&times;</button>`;

      /* Couleur */
      row.querySelector('.color-swatch').addEventListener('input', e => {
        _markModified(item.id, cat, item, { color: e.target.value });
        _updateSaveBar();
      });

      /* Valeur texte */
      const valEl = row.querySelector('.item-value');
      valEl.addEventListener('blur', () => {
        const newVal = valEl.textContent.trim();
        if (!newVal) {
          // Restaure la valeur précédente
          valEl.textContent = ((_draft[item.id] && _draft[item.id].value !== undefined)
            ? _draft[item.id].value : item.value) || item.value;
          return;
        }
        _markModified(item.id, cat, item, { value: newVal });
        _updateSaveBar();
      });
      valEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); valEl.blur(); }
        if (e.key === 'Escape') {
          // Restaure sans sauver
          valEl.textContent = ((_draft[item.id] && _draft[item.id].value !== undefined)
            ? _draft[item.id].value : item.value);
          valEl.blur();
        }
      });

      /* Supprimer */
      row.querySelector('.item-del').addEventListener('click', () => {
        _deleteItem(item.id, cat, item, row);
      });
    }

    listEl.appendChild(row);
  });
}

/* Rendu d'un item "added" (brouillon, pas encore en BDD) */
function _renderAddedItem(cat, added, listEl) {
  const row = document.createElement('div');
  row.className = 'settings-item';
  row.dataset.tmpId = added._tmpId;
  row.dataset.dirty = 'added';

  row.innerHTML = `
<input type="color" class="color-swatch" value="${esc(added.color)}" title="Couleur">
<span class="item-value" contenteditable="true" spellcheck="false">${esc(added.value)}</span>
<button class="item-del" title="Supprimer" type="button">&times;</button>`;

  /* Couleur */
  row.querySelector('.color-swatch').addEventListener('input', e => {
    added.color = e.target.value;
    _updateSaveBar();
  });

  /* Valeur */
  const valEl = row.querySelector('.item-value');
  valEl.addEventListener('blur', () => {
    const newVal = valEl.textContent.trim();
    if (!newVal) { valEl.textContent = added.value; return; }
    added.value = newVal;
    _updateSaveBar();
  });
  valEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); valEl.blur(); }
  });

  /* Supprimer un ajout brouillon */
  row.querySelector('.item-del').addEventListener('click', () => {
    _added = _added.filter(a => a._tmpId !== added._tmpId);
    row.remove();
    _updateSaveBar();
  });

  listEl.appendChild(row);
}

/* ── Mutations brouillon ─────────────────────────────────────────────────── */
function _markModified(id, cat, origItem, patch) {
  const existing = _draft[id] || { state: 'modified', cat,
    origValue: origItem.value, origColor: origItem.color || '#EDE6D8' };
  // Récupère les valeurs courantes (déjà modifiées) ou l'original
  const currentValue = existing.value !== undefined ? existing.value : origItem.value;
  const currentColor = existing.color !== undefined ? existing.color : (origItem.color || '#EDE6D8');
  _draft[id] = {
    ...existing,
    state: 'modified',
    value: patch.value !== undefined ? patch.value : currentValue,
    color: patch.color !== undefined ? patch.color : currentColor,
  };
  // Màj visuelle de la ligne
  const row = document.querySelector(`.settings-item[data-id="${id}"]`);
  if (row) row.dataset.dirty = 'modified';
}

function _deleteItem(id, cat, origItem, rowEl) {
  _draft[id] = {
    state: 'deleted',
    cat,
    origValue: origItem.value,
    origColor: origItem.color || '#EDE6D8',
  };
  // Re-render juste cette ligne pour afficher l'état "deleted" avec bouton restaurer
  const list = rowEl.parentElement;
  rowEl.remove();
  // Insérer la ligne "deleted"
  const tempRow = document.createElement('div');
  tempRow.className = 'settings-item';
  tempRow.dataset.id = id;
  tempRow.dataset.dirty = 'deleted';
  tempRow.innerHTML = `
<input type="color" class="color-swatch" value="${esc(origItem.color || '#EDE6D8')}" disabled>
<span class="item-value">${esc(origItem.value)}</span>
<button class="item-restore" title="Restaurer" data-id="${id}">↩</button>`;
  tempRow.querySelector('.item-restore').addEventListener('click', () => {
    _restoreItem(id, list);
  });
  list.appendChild(tempRow);
  _updateSaveBar();
}

function _restoreItem(id, listEl) {
  delete _draft[id];
  // Re-render la liste entière de la section est simple mais rechargement partiel OK
  // Pour éviter un full reload : on ré-insère l'item depuis origCfg
  let origItem = null;
  let cat = null;
  for (const [c, items] of Object.entries(_origCfg)) {
    const found = items.find(i => String(i.id) === String(id));
    if (found) { origItem = found; cat = c; break; }
  }
  if (!origItem) return;

  // Supprimer la ligne deleted
  const deletedRow = listEl.querySelector(`.settings-item[data-id="${id}"]`);
  if (deletedRow) deletedRow.remove();

  // Recréer la ligne normale
  _renderList(cat, [origItem], listEl);
  _updateSaveBar();
}

function _addItem(cat, value, color, listEl) {
  const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const added = { _tmpId: tmpId, category: cat, value, color };
  _added.push(added);
  _renderAddedItem(cat, added, listEl);
  _updateSaveBar();
}

/* ── Barre sticky ────────────────────────────────────────────────────────── */
function _countChanges() {
  return Object.keys(_draft).length + _added.length;
}

function _updateSaveBar() {
  const bar = document.getElementById('settings-save-bar');
  const countEl = document.getElementById('draft-count');
  if (!bar) return;
  const n = _countChanges();
  if (n === 0) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = n;
  }
}

/* ── Annuler ─────────────────────────────────────────────────────────────── */
function _discardDraft() {
  _draft = {};
  _added = [];
  // Restaurer l'état depuis _origCfg
  State.setCfg(JSON.parse(JSON.stringify(_origCfg)));
  _renderGrid();
  _updateSaveBar();
}

/* ── Modale de confirmation ──────────────────────────────────────────────── */
function _buildChangesList() {
  const changes = [];

  // Modifications et suppressions d'items existants
  for (const [id, d] of Object.entries(_draft)) {
    let origItem = null;
    let catLabel = '';
    for (const [cat, items] of Object.entries(_origCfg)) {
      const f = items.find(i => String(i.id) === String(id));
      if (f) { origItem = f; catLabel = CAT_LABELS[cat] || cat; break; }
    }
    if (!origItem) continue;

    if (d.state === 'deleted') {
      changes.push({ type: 'delete', cat: catLabel, label: `Suppression : "${origItem.value}"` });
    } else if (d.state === 'modified') {
      const parts = [];
      if (d.value !== undefined && d.value !== origItem.value) {
        parts.push(`"${origItem.value}" renommé en "${d.value}"`);
      }
      if (d.color !== undefined && d.color.toLowerCase() !== (origItem.color || '#ede6d8').toLowerCase()) {
        parts.push('couleur modifiée');
      }
      if (parts.length) {
        changes.push({ type: 'modify', cat: catLabel, label: parts.join(' + ') });
      }
    }
  }

  // Ajouts
  for (const a of _added) {
    const catLabel = CAT_LABELS[a.category] || a.category;
    changes.push({ type: 'add', cat: catLabel, label: `Ajout : "${a.value}"` });
  }

  return changes;
}

function _openConfirmModal() {
  const changes = _buildChangesList();
  if (changes.length === 0) { _discardDraft(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'settings-confirm-overlay';
  overlay.innerHTML = `
<div class="settings-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
  <div class="settings-confirm-hdr">
    <h3 id="confirm-title">Confirmer les modifications</h3>
    <p>${changes.length} modification${changes.length > 1 ? 's' : ''} seront appliquées immédiatement.</p>
  </div>
  <div class="settings-confirm-body">
    <ul class="settings-changes-list" id="changes-list"></ul>
  </div>
  <div class="settings-confirm-ftr">
    <button class="btn btn-ghost" id="btn-cancel-confirm">Retour</button>
    <button class="btn btn-primary" id="btn-apply-confirm">Appliquer les modifications</button>
  </div>
</div>`;

  const list = overlay.querySelector('#changes-list');
  changes.forEach(ch => {
    const li = document.createElement('li');
    const iconMap = { add: '＋', modify: '✎', delete: '✕' };
    const classMap = { add: 'change-add', modify: 'change-modify', delete: 'change-delete' };
    li.className = `settings-change-item ${classMap[ch.type]}`;
    li.innerHTML = `
<span class="settings-change-icon">${iconMap[ch.type]}</span>
<div class="settings-change-text">
  <span class="settings-change-cat">${esc(ch.cat)}</span>
  ${esc(ch.label)}
</div>`;
    list.appendChild(li);
  });

  document.body.appendChild(overlay);

  /* Fermer en cliquant sur l'overlay */
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  /* Retour */
  overlay.querySelector('#btn-cancel-confirm').addEventListener('click', () => {
    overlay.remove();
  });

  /* Appliquer */
  overlay.querySelector('#btn-apply-confirm').addEventListener('click', async () => {
    const applyBtn = overlay.querySelector('#btn-apply-confirm');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Enregistrement…';
    try {
      await _applyDraft();
      overlay.remove();
    } catch (err) {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Appliquer les modifications';
      _showError('Une erreur est survenue. Certains changements n\'ont pas été sauvegardés.');
    }
  });

  /* Focus trap simple */
  setTimeout(() => overlay.querySelector('#btn-cancel-confirm')?.focus(), 50);
}

/* ── Application du brouillon ────────────────────────────────────────────── */
async function _applyDraft() {
  const errors = [];

  // 1. Modifications & suppressions d'items existants
  for (const [id, d] of Object.entries(_draft)) {
    try {
      if (d.state === 'deleted') {
        await API.deleteConfig(id);
      } else if (d.state === 'modified') {
        // Récupère les valeurs actuelles pour l'API (value + color requis)
        let origItem = null;
        for (const items of Object.values(_origCfg)) {
          const f = items.find(i => String(i.id) === String(id));
          if (f) { origItem = f; break; }
        }
        const val   = d.value !== undefined ? d.value : (origItem ? origItem.value : '');
        const color = d.color !== undefined ? d.color : (origItem ? origItem.color : null);
        await API.putConfig(id, { value: val, color });
      }
    } catch (e) {
      errors.push(`id ${id}: ${e.message || 'erreur'}`);
    }
  }

  // 2. Nouveaux items
  for (const a of _added) {
    try {
      await API.postConfig({ category: a.category, value: a.value, color: a.color });
    } catch (e) {
      errors.push(`ajout "${a.value}": ${e.message || 'erreur'}`);
    }
  }

  if (errors.length) {
    throw new Error(errors.join(' | '));
  }

  // Rechargement propre
  await loadSettings();
}

/* ── Backup ──────────────────────────────────────────────────────────────── */
async function _handleBackup() {
  const btn = document.getElementById('btn-backup');
  if (!btn) return;
  btn.textContent = 'Export en cours…';
  btn.disabled = true;
  try {
    const data = await API.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `presspilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('Erreur lors de l\'export.');
  } finally {
    btn.textContent = 'Télécharger la sauvegarde';
    btn.disabled = false;
  }
}

/* ── Utilitaire toast d'erreur ────────────────────────────────────────────── */
function _showError(msg) {
  const toast = document.getElementById('undo-toast');
  const msgEl = document.getElementById('undo-msg');
  if (!toast || !msgEl) { alert(msg); return; }
  msgEl.textContent = msg;
  toast.style.display = 'flex';
  setTimeout(() => { if (toast) toast.style.display = 'none'; }, 5000);
}
