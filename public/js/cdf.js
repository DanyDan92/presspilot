/* PressPilot V2 — cdf.js
   Conducteur De Fabrication modal.
   openCDF(mag, num) is called from dashboard, issues, articles. */

import * as API from './api.js';
import { esc } from './helpers.js';
import { navigate } from './nav.js';
import * as State from './state.js';

let _cdfOverlay = null;

function ensureOverlay() {
  if (_cdfOverlay && document.body.contains(_cdfOverlay)) return _cdfOverlay;
  _cdfOverlay = document.createElement('div');
  _cdfOverlay.id = 'modal-cdf';
  _cdfOverlay.className = 'modal-overlay modal-fullscreen';
  _cdfOverlay.style.display = 'none';
  _cdfOverlay.innerHTML = `
    <div class="modal modal-cdf-inner">
      <div class="cdf-header">
        <h3 id="cdf-title" class="dash-title"></h3>
        <div class="cdf-header-actions">
          <button class="btn btn-primary btn-sm" id="btn-export-xlsx">↓ Exporter xlsx</button>
          <button class="btn btn-ghost btn-sm" id="btn-cdf-close">✕ Fermer</button>
        </div>
      </div>
      <div id="cdf-legend" class="cdf-legend"></div>
      <div id="cdf-grid" class="cdf-grid-wrap"></div>
    </div>`;
  document.body.appendChild(_cdfOverlay);

  _cdfOverlay.querySelector('#btn-cdf-close').addEventListener('click', () => { _cdfOverlay.style.display='none'; });
  _cdfOverlay.addEventListener('click', e => { if(e.target===_cdfOverlay) _cdfOverlay.style.display='none'; });
  return _cdfOverlay;
}

export async function openCDF(mag, num) {
  const overlay = ensureOverlay();
  overlay.querySelector('#cdf-title').textContent = `${mag} — N°${num}`;
  overlay.style.display = 'flex';
  await loadCDF(mag, num, overlay);
}

async function loadCDF(mag, num, overlay) {
  const data = await API.getCDF(mag, num);
  const { articles, maxPage, colorMap } = data;
  overlay.querySelector('#cdf-legend').innerHTML = Object.entries(colorMap).map(([label, color]) =>
    `<span class="legend-chip"><span class="legend-swatch" style="background:${color}"></span>${esc(label)}</span>`
  ).join('');
  if (!articles.length || !maxPage) {
    overlay.querySelector('#cdf-grid').innerHTML = '<div class="empty">Aucun article avec pages pour ce numéro.</div>';
    overlay.querySelector('#btn-export-xlsx').onclick = null;
    return;
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
  const grid = overlay.querySelector('#cdf-grid');
  grid.innerHTML = html;

  grid.querySelectorAll('.cdf-cell:not(.empty-page)').forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => {
      State.setCurrentMag(mag); State.setCurrentNum(num);
      overlay.style.display = 'none';
      navigate('articles');
    });
  });

  overlay.querySelector('#btn-export-xlsx').onclick = () => {
    window.location.href = `/api/export/cdf?magazine=${encodeURIComponent(mag)}&numero=${encodeURIComponent(num)}`;
  };
}
