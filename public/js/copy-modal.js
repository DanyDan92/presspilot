/* PressPilot V2 — copy-modal.js
   Module autonome de duplication.
   Fonctionne indépendamment du module monté (pattern ensureOverlay comme cdf.js).

   Exports :
   - openCopyModal(mag, num)        : duplique un sommaire/numéro entier
   - openArticleDuplicate(articleId): duplique un article unique
*/

import * as State from './state.js';
import * as API   from './api.js';
import { esc }    from './helpers.js';
import { showToast, pushUndo } from './ui-shell.js';

// ── OVERLAY SOMMAIRE (duplication numéro) ─────────────────────────────────────
let _issueOverlay = null;

function ensureIssueOverlay() {
  if (_issueOverlay && document.body.contains(_issueOverlay)) return _issueOverlay;

  _issueOverlay = document.createElement('div');
  _issueOverlay.id = 'modal-copy-autonomous';
  _issueOverlay.className = 'modal-overlay';
  _issueOverlay.style.display = 'none';
  _issueOverlay.innerHTML = `
    <div class="modal modal-copy-inner" role="dialog" aria-modal="true" aria-labelledby="copy-auto-title">
      <h3 id="copy-auto-title">Dupliquer le sommaire</h3>
      <p class="modal-source">Source : <strong id="copy-auto-from"></strong></p>
      <div class="copy-sections">
        <div class="copy-section">
          <h4>Champs à copier</h4>
          <div class="copy-checkboxes">
            <label><input type="checkbox" id="copy-auto-pages" checked> Pages (début / fin)</label>
            <label><input type="checkbox" id="copy-auto-type" checked> Type de contenu</label>
            <label><input type="checkbox" id="copy-auto-rubrique" checked> Rubrique</label>
            <label><input type="checkbox" id="copy-auto-titre"> Titre</label>
            <label><input type="checkbox" id="copy-auto-resume"> Résumé / Angles</label>
          </div>
        </div>
        <div class="copy-section">
          <h4>Numéro de destination</h4>
          <label><span>Magazine</span><input id="copy-auto-dest-mag" type="text" placeholder="(laisse vide = même magazine)"></label>
          <label><span>Numéro</span><input id="copy-auto-dest-num" type="text" placeholder="ex: 59" required></label>
          <div class="copy-issue-opts">
            <label class="copy-create-toggle"><input type="checkbox" id="copy-auto-create-issue"> Créer aussi dans la table Magazines</label>
          </div>
          <div id="copy-auto-issue-form" style="display:none">
            <label><span>Format page</span><select id="copy-auto-fmt"><option value=""></option></select></label>
            <label><span>Deadline rédaction</span><input id="copy-auto-dl-redac" type="date"></label>
            <label><span>Deadline bouclage</span><input id="copy-auto-dl-bouclage" type="date"></label>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-copy-auto-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-copy-auto-confirm">Dupliquer</button>
      </div>
    </div>`;

  document.body.appendChild(_issueOverlay);

  // Toggle "Créer dans Magazines"
  _issueOverlay.querySelector('#copy-auto-create-issue').addEventListener('change', function () {
    const form = _issueOverlay.querySelector('#copy-auto-issue-form');
    if (form) form.style.display = this.checked ? 'flex' : 'none';
  });

  // Annuler / clic fond
  const close = () => { _issueOverlay.style.display = 'none'; };
  _issueOverlay.querySelector('#btn-copy-auto-cancel').addEventListener('click', close);
  _issueOverlay.addEventListener('click', e => { if (e.target === _issueOverlay) close(); });

  // Confirmer
  _issueOverlay.querySelector('#btn-copy-auto-confirm').addEventListener('click', async () => {
    const destMag = _issueOverlay.querySelector('#copy-auto-dest-mag').value.trim() || State.copySourceMag;
    const destNum = _issueOverlay.querySelector('#copy-auto-dest-num').value.trim();
    if (!destNum) { alert('Numéro de destination requis.'); return; }

    const fields = [];
    if (_issueOverlay.querySelector('#copy-auto-pages').checked)    { fields.push('page_debut', 'page_fin'); }
    if (_issueOverlay.querySelector('#copy-auto-type').checked)     fields.push('type_contenu');
    if (_issueOverlay.querySelector('#copy-auto-rubrique').checked) fields.push('rubrique');
    if (_issueOverlay.querySelector('#copy-auto-titre').checked)    fields.push('titre');
    if (_issueOverlay.querySelector('#copy-auto-resume').checked)   fields.push('resume');

    try {
      const r = await fetch('/api/copy-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          magazine:    destMag,
          from_numero: State.copySourceNum,
          to_numero:   destNum,
          fields,
        }),
      });
      const result = await r.json();

      if (_issueOverlay.querySelector('#copy-auto-create-issue').checked) {
        await API.postIssue({
          magazine:           destMag,
          numero:             destNum,
          format_page:        _issueOverlay.querySelector('#copy-auto-fmt').value || null,
          deadline_redaction: _issueOverlay.querySelector('#copy-auto-dl-redac').value || null,
          deadline:           _issueOverlay.querySelector('#copy-auto-dl-bouclage').value || null,
        });
      }

      close();

      if (r.ok) {
        showToast(`${result.copied} article(s) copié(s) vers N°${destNum}`);
        // Rafraîchit State.allIssues pour les autres modules
        const issues = await API.getIssues();
        State.setAllIssues(issues);
      } else {
        alert(result.error || 'Erreur lors de la duplication.');
      }
    } catch (err) {
      alert('Erreur réseau : ' + err.message);
    }
  });

  // Echap ferme
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _issueOverlay.style.display !== 'none') {
      close();
    }
  });

  return _issueOverlay;
}

/**
 * Ouvre la modale de duplication d'un sommaire (tous les articles d'un numéro).
 * Peut être appelé depuis n'importe quel module monté ou non.
 * @param {string} mag  - Magazine source
 * @param {string} num  - Numéro source
 */
export function openCopyModal(mag, num) {
  State.setCopySource(mag || State.currentMag, num || State.currentNum);
  if (!State.copySourceMag) { alert("Sélectionne un magazine d'abord."); return; }

  const overlay = ensureIssueOverlay();

  // Réinitialise les champs
  overlay.querySelector('#copy-auto-from').textContent = `${State.copySourceMag} — N°${State.copySourceNum}`;
  overlay.querySelector('#copy-auto-dest-mag').value = State.copySourceMag;
  overlay.querySelector('#copy-auto-dest-num').value = '';
  overlay.querySelector('#copy-auto-create-issue').checked = false;
  overlay.querySelector('#copy-auto-issue-form').style.display = 'none';

  // Rempli formats depuis config
  const fmtSel = overlay.querySelector('#copy-auto-fmt');
  if (fmtSel) {
    fmtSel.innerHTML = '<option value=""></option>' +
      (State.cfg.format_page || []).map(c => `<option>${esc(c.value)}</option>`).join('');
  }

  overlay.style.display = 'flex';
  // Focus sur le champ numéro destination
  setTimeout(() => overlay.querySelector('#copy-auto-dest-num')?.focus(), 50);
}

// ── OVERLAY ARTICLE UNIQUE ────────────────────────────────────────────────────
let _articleOverlay = null;
let _currentArticleId = null;

function ensureArticleOverlay() {
  if (_articleOverlay && document.body.contains(_articleOverlay)) return _articleOverlay;

  _articleOverlay = document.createElement('div');
  _articleOverlay.id = 'modal-article-dup';
  _articleOverlay.className = 'modal-overlay';
  _articleOverlay.style.display = 'none';
  _articleOverlay.innerHTML = `
    <div class="modal modal-copy-inner" role="dialog" aria-modal="true" aria-labelledby="art-dup-title">
      <h3 id="art-dup-title">Dupliquer l'article</h3>
      <p class="modal-source" id="art-dup-source"></p>
      <div class="copy-sections">
        <div class="copy-section">
          <h4>Champs à copier</h4>
          <div class="copy-checkboxes">
            <label><input type="checkbox" id="artdup-titre" checked> Titre</label>
            <label><input type="checkbox" id="artdup-pages" checked> Pages (début / fin)</label>
            <label><input type="checkbox" id="artdup-type" checked> Type de contenu</label>
            <label><input type="checkbox" id="artdup-rubrique" checked> Rubrique</label>
            <label><input type="checkbox" id="artdup-resume"> Résumé / Angles</label>
            <label><input type="checkbox" id="artdup-source"> Source (URL)</label>
            <label><input type="checkbox" id="artdup-commentaires"> Commentaires</label>
          </div>
        </div>
        <div class="copy-section">
          <h4>Destination</h4>
          <label><span>Magazine</span><select id="artdup-dest-mag" style="width:100%"></select></label>
          <label><span>Numéro</span><select id="artdup-dest-num" style="width:100%"></select></label>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-artdup-cancel">Annuler</button>
        <button class="btn btn-primary" id="btn-artdup-confirm">Dupliquer</button>
      </div>
    </div>`;

  document.body.appendChild(_articleOverlay);

  // Quand mag change → rafraîchit les numéros
  _articleOverlay.querySelector('#artdup-dest-mag').addEventListener('change', () => _updateArtdupNums());

  // Annuler / clic fond
  const close = () => { _articleOverlay.style.display = 'none'; _currentArticleId = null; };
  _articleOverlay.querySelector('#btn-artdup-cancel').addEventListener('click', close);
  _articleOverlay.addEventListener('click', e => { if (e.target === _articleOverlay) close(); });

  // Confirmer
  _articleOverlay.querySelector('#btn-artdup-confirm').addEventListener('click', async () => {
    if (_currentArticleId === null) return;
    const destMag = _articleOverlay.querySelector('#artdup-dest-mag').value;
    const destNum = _articleOverlay.querySelector('#artdup-dest-num').value;

    const fields = [];
    if (_articleOverlay.querySelector('#artdup-titre').checked)       fields.push('titre');
    if (_articleOverlay.querySelector('#artdup-pages').checked)       { fields.push('page_debut', 'page_fin'); }
    if (_articleOverlay.querySelector('#artdup-type').checked)        fields.push('type_contenu');
    if (_articleOverlay.querySelector('#artdup-rubrique').checked)    fields.push('rubrique');
    if (_articleOverlay.querySelector('#artdup-resume').checked)      fields.push('resume');
    if (_articleOverlay.querySelector('#artdup-source').checked)      fields.push('article_source');
    if (_articleOverlay.querySelector('#artdup-commentaires').checked) fields.push('commentaires');

    try {
      const r = await fetch('/api/articles/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids:          [_currentArticleId],
          fields,
          dest_magazine: destMag || undefined,
          dest_numero:   destNum || undefined,
        }),
      });
      const result = await r.json();
      close();
      if (r.ok && result.newIds?.length) {
        pushUndo({ type: 'create', ids: result.newIds });
        showToast('Article dupliqué');
      } else if (r.ok) {
        showToast('Article dupliqué');
      } else {
        alert(result.error || 'Erreur lors de la duplication.');
      }
      // Reload articles si le module est monté
      if (window.PP_reloadArticles) window.PP_reloadArticles();
    } catch (err) {
      alert('Erreur réseau : ' + err.message);
    }
  });

  // Echap ferme
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _articleOverlay.style.display !== 'none') {
      close();
    }
  });

  return _articleOverlay;
}

function _updateArtdupNums() {
  const mag    = _articleOverlay.querySelector('#artdup-dest-mag')?.value;
  const nums   = State.allIssues.filter(i => i.magazine === mag).map(i => i.numero);
  const numSel = _articleOverlay.querySelector('#artdup-dest-num');
  if (numSel) {
    numSel.innerHTML = nums.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    // Pré-sélectionne le numéro courant si disponible
    if (State.currentNum && nums.includes(State.currentNum)) numSel.value = State.currentNum;
  }
}

/**
 * Ouvre la modale de duplication d'un article unique.
 * @param {number} articleId - ID de l'article à dupliquer
 */
export function openArticleDuplicate(articleId) {
  _currentArticleId = articleId;
  const overlay = ensureArticleOverlay();

  // Infos source
  const art = State.articlesCache[articleId];
  const sourceLabel = art
    ? `${art.magazine} — N°${art.numero}${art.titre ? ' — ' + art.titre : ''}`
    : `Article #${articleId}`;
  overlay.querySelector('#art-dup-source').textContent = `Source : ${sourceLabel}`;

  // Rempli les magazines
  const mags   = [...new Set(State.allIssues.map(i => i.magazine))].sort();
  const magSel = overlay.querySelector('#artdup-dest-mag');
  if (magSel) {
    magSel.innerHTML = mags.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    // Pré-sélectionne le magazine de l'article
    const artMag = art?.magazine || State.currentMag;
    if (artMag && mags.includes(artMag)) magSel.value = artMag;
  }
  _updateArtdupNums();

  overlay.style.display = 'flex';
}
