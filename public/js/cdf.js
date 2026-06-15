/* PressPilot V2 — cdf.js
   Conducteur De Fabrication modal.
   openCDF(mag, num) is called from dashboard, issues, articles.

   Features B (V2) :
   - Lien source visible + cliquable par article (ouvre la source, ne navigue pas)
   - Clic article (ou case si 1 article) = deep-link vers l'article précis via
     window.PP_pendingArticleFilter = { magazine, numero, articleId, page_debut, page_fin }
     puis window.PP_navigate('articles') */

import * as API from './api.js';
import { esc } from './helpers.js';
// Note: navigation uses window.PP_navigate (no circular import).
// State is not needed here since deep-link passes data via window.PP_pendingArticleFilter.

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

  _cdfOverlay.querySelector('#btn-cdf-close').addEventListener('click', () => { _cdfOverlay.style.display = 'none'; });
  _cdfOverlay.addEventListener('click', e => { if (e.target === _cdfOverlay) _cdfOverlay.style.display = 'none'; });
  return _cdfOverlay;
}

export async function openCDF(mag, num) {
  const overlay = ensureOverlay();
  overlay.querySelector('#cdf-title').textContent = `${mag} — N°${num}`;
  overlay.style.display = 'flex';
  await loadCDF(mag, num, overlay);
}

/** Build the source link HTML for a single article. */
function buildSourceLink(a) {
  if (!a.article_source) return '';
  // Truncate long URLs for display
  let label = a.article_source;
  try {
    const u = new URL(a.article_source);
    label = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch (_) {
    // not a valid URL, use raw string truncated
  }
  if (label.length > 40) label = label.slice(0, 38) + '…';
  return `<a class="cdf-source-link" href="${esc(a.article_source)}" target="_blank" rel="noopener" title="${esc(a.article_source)}">🔗 ${esc(label)}</a>`;
}

/** Navigate to a precise article. Called on article row click (and single-art cell click). */
function deepLinkArticle(mag, num, a, overlay) {
  window.PP_pendingArticleFilter = {
    magazine:   mag,
    numero:     num,
    articleId:  a.id,
    page_debut: a.page_debut,
    page_fin:   a.page_fin,
  };
  overlay.style.display = 'none';
  window.PP_navigate('articles');
}

async function loadCDF(mag, num, overlay) {
  const grid = overlay.querySelector('#cdf-grid');
  grid.innerHTML = '<div class="cdf-loading">Chargement…</div>';

  const data = await API.getCDF(mag, num);
  const { articles, maxPage, colorMap } = data;

  overlay.querySelector('#cdf-legend').innerHTML = Object.entries(colorMap).map(([label, color]) =>
    `<span class="legend-chip"><span class="legend-swatch" style="background:${color}"></span>${esc(label)}</span>`
  ).join('');

  if (!articles.length || !maxPage) {
    grid.innerHTML = '<div class="empty">Aucun article avec pages pour ce numéro.</div>';
    overlay.querySelector('#btn-export-xlsx').onclick = null;
    return;
  }

  // Group articles by page range
  const groupMap = new Map();
  for (const a of articles) {
    const fin = a.page_fin ?? a.page_debut;
    const key = `${a.page_debut}-${fin}`;
    if (!groupMap.has(key)) groupMap.set(key, { debut: a.page_debut, fin, arts: [] });
    groupMap.get(key).arts.push(a);
  }
  const sortedGroups = [...groupMap.values()].sort((a, b) => a.debut - b.debut);

  const COLS = 10;
  let html = '';

  for (let rowStart = 1; rowStart <= maxPage; rowStart += COLS) {
    const rowEnd = Math.min(rowStart + COLS - 1, maxPage);
    const rowGroups = sortedGroups.filter(g => g.debut <= rowEnd && g.fin >= rowStart);
    let page = rowStart, rowHtml = '';

    for (const grp of rowGroups) {
      // Empty page cells before this group
      for (let p = page; p < grp.debut && p <= rowEnd; p++) {
        rowHtml += `<div class="cdf-cell empty-page" style="flex:1"><div class="cdf-page-num">${p}</div></div>`;
      }

      const cd = Math.max(rowStart, grp.debut), ce = Math.min(rowEnd, grp.fin), span = ce - cd + 1;
      const color = grp.arts[0] ? (colorMap[grp.arts[0].type_contenu] || colorMap[grp.arts[0].rubrique] || null) : null;
      const badge = grp.arts.length > 1 ? `<span class="cdf-count">×${grp.arts.length}</span>` : '';

      const isSingle = grp.arts.length === 1;

      // Build article rows — each individually clickable for deep-link
      const artsHtml = grp.arts.map(a => {
        const sourceLink = buildSourceLink(a);
        // data attributes for JS delegation
        return `<div class="cdf-art cdf-art-clickable"
          data-art-id="${a.id}"
          data-art-page-debut="${a.page_debut ?? ''}"
          data-art-page-fin="${a.page_fin ?? ''}"
          title="Ouvrir l'article dans Articles">
          <span class="cdf-type">${esc(a.type_contenu || '')}</span><span class="cdf-rubrique">${esc(a.rubrique || '')}</span>
          <div class="cdf-titre">${esc(a.titre)}</div>
          ${sourceLink}
        </div>`;
      }).join('');

      // If single article: whole cell is deep-link-able (data on cell)
      // If multi: cell click does nothing (articles handle it); prevent bubbling from source links
      const cellData = isSingle
        ? `data-art-id="${grp.arts[0].id}" data-art-page-debut="${grp.arts[0].page_debut ?? ''}" data-art-page-fin="${grp.arts[0].page_fin ?? ''}" data-cdf-clickable="single"`
        : `data-cdf-clickable="multi"`;

      rowHtml += `<div class="cdf-cell" style="flex:${span};${color ? `background:${color}` : ''}" ${cellData}>
        <div class="cdf-page-num">${grp.debut}${grp.fin !== grp.debut ? `-${grp.fin}` : ''} ${badge}</div>
        <div class="cdf-arts-list">${artsHtml}</div>
      </div>`;

      page = grp.fin + 1;
    }

    // Trailing empty cells
    for (let p = page; p <= rowEnd; p++) {
      rowHtml += `<div class="cdf-cell empty-page" style="flex:1"><div class="cdf-page-num">${p}</div></div>`;
    }
    html += `<div class="cdf-row">${rowHtml}</div>`;
  }

  grid.innerHTML = html;

  // ── Event delegation on the grid ──────────────────────────────────────────

  // Source links: open URL in new tab, stop propagation so cell click doesn't fire
  grid.addEventListener('click', e => {
    const link = e.target.closest('.cdf-source-link');
    if (link) {
      e.stopPropagation();
      // href handled natively by <a>; just ensure no further handlers run
      return;
    }
  }, true); // capture phase to beat cell listener

  // Article row click → deep-link to that precise article
  grid.querySelectorAll('.cdf-art-clickable').forEach(artEl => {
    artEl.addEventListener('click', e => {
      // If the click was on the source link, let it go through natively (captured above)
      if (e.target.closest('.cdf-source-link')) return;
      e.stopPropagation();
      const id        = Number(artEl.dataset.artId);
      const pageDebut = artEl.dataset.artPageDebut !== '' ? Number(artEl.dataset.artPageDebut) : null;
      const pageFin   = artEl.dataset.artPageFin   !== '' ? Number(artEl.dataset.artPageFin)   : null;
      deepLinkArticle(mag, num, { id, page_debut: pageDebut, page_fin: pageFin }, overlay);
    });
  });

  // Single-art cell click (anywhere on the cell outside the article row) → same deep-link
  grid.querySelectorAll('.cdf-cell[data-cdf-clickable="single"]').forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', e => {
      if (e.target.closest('.cdf-art-clickable') || e.target.closest('.cdf-source-link')) return;
      const id        = Number(cell.dataset.artId);
      const pageDebut = cell.dataset.artPageDebut !== '' ? Number(cell.dataset.artPageDebut) : null;
      const pageFin   = cell.dataset.artPageFin   !== '' ? Number(cell.dataset.artPageFin)   : null;
      deepLinkArticle(mag, num, { id, page_debut: pageDebut, page_fin: pageFin }, overlay);
    });
  });

  // Multi-art cell: cursor default (individual article rows are clickable)
  grid.querySelectorAll('.cdf-cell[data-cdf-clickable="multi"]').forEach(cell => {
    cell.style.cursor = 'default';
  });

  // Export button
  overlay.querySelector('#btn-export-xlsx').onclick = () => {
    window.location.href = `/api/export/cdf?magazine=${encodeURIComponent(mag)}&numero=${encodeURIComponent(num)}`;
  };
}
