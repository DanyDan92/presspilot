/* PressPilot V2 — settings.js
   Module: Paramètres.
   Exposes mount(container) / unmount(). */

import * as State from './state.js';
import * as API   from './api.js';
import { esc } from './helpers.js';

let _mounted = false;

export function mount(container) {
  _mounted = true;
  container.innerHTML = `<div class="settings-wrap">
    <h2 class="dash-title" style="margin-bottom:24px">Paramètres</h2>
    <div class="settings-backup-card">
      <div class="settings-backup-info">
        <strong>Sauvegarde des données</strong>
        <span>Télécharge un fichier JSON contenant toutes tes données (articles, magazines, facturation).</span>
      </div>
      <button class="btn btn-primary" id="btn-backup">Télécharger la sauvegarde</button>
    </div>
    <div class="settings-grid" id="settings-grid"></div>
  </div>`;

  document.getElementById('btn-backup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-backup');
    btn.textContent = 'Export en cours...';
    btn.disabled = true;
    try {
      const data = await API.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `presspilot-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert('Erreur lors de l\'export.'); }
    finally { btn.textContent = 'Télécharger la sauvegarde'; btn.disabled = false; }
  });
  loadSettings();
}
export function unmount() {
  _mounted = false;
}

async function loadSettings() {
  State.setCfg(await API.getConfig());
  const grid = document.getElementById('settings-grid');
  if (!grid) return;
  const labels = { type_contenu:'Types de contenu', rubrique:'Rubriques', format_page:'Formats', statut_numero:'Statuts numéro', statut_paiement:'Statuts paiement' };
  grid.innerHTML = Object.entries(State.cfg).map(([cat, items]) => `
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
      await API.putConfig(inp.dataset.id, {value:val, color:inp.value});
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
      await API.putConfig(el.dataset.id, {value:newVal, color});
    });
    el.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();el.blur();} });
  });
  grid.querySelectorAll('.item-del').forEach(btn => {
    btn.addEventListener('click', async () => { await API.deleteConfig(btn.dataset.id); loadSettings(); });
  });
  grid.querySelectorAll('.settings-section').forEach(sec => {
    const cat = sec.dataset.cat;
    sec.querySelector('.add-btn').addEventListener('click', async () => {
      const val = sec.querySelector('.add-value').value.trim();
      const col = sec.querySelector('.add-color').value;
      if (!val) return;
      await API.postConfig({category:cat, value:val, color:col});
      loadSettings();
    });
  });
}
