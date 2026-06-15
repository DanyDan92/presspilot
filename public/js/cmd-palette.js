/* PressPilot V2 — cmd-palette.js
   Cmd/Ctrl+K quick-access palette.
   Allows jumping to a route or searching for a magazine / article. */

import * as State from './state.js';
import * as API   from './api.js';
import { esc } from './helpers.js';
import { navigate } from './nav.js';

const ROUTES = [
  { key:'dashboard',  label:'Dashboard',           icon:'📊' },
  { key:'articles',   label:'Articles',            icon:'📝' },
  { key:'magazines',  label:'Magazines / Numéros', icon:'📰' },
  { key:'cdf',        label:'Conducteur (CDF)',     icon:'🗺' },
  { key:'calendar',   label:'Calendrier',           icon:'📅' },
  { key:'billing',    label:'Facturation',          icon:'💶' },
  { key:'settings',   label:'Paramètres',           icon:'⚙️' },
];

let _overlay = null;
let _input   = null;
let _results = null;
let _selectedIdx = 0;
let _currentItems = [];

function ensureDOM() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.id = 'cmd-palette-overlay';
  _overlay.style.display = 'none';
  _overlay.innerHTML = `
    <div id="cmd-palette" role="dialog" aria-label="Recherche rapide">
      <input id="cmd-palette-input" type="text" placeholder="Sauter à… ou rechercher un magazine / article" autocomplete="off" spellcheck="false">
      <div id="cmd-palette-results"></div>
    </div>`;
  document.body.appendChild(_overlay);
  _input   = _overlay.querySelector('#cmd-palette-input');
  _results = _overlay.querySelector('#cmd-palette-results');

  _overlay.addEventListener('click', e => { if (e.target === _overlay) close(); });
  _input.addEventListener('input', () => { _selectedIdx = 0; renderResults(_input.value); });
  _input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); move(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); selectCurrent(); return; }
  });
}

function open() {
  ensureDOM();
  _overlay.style.display = 'flex';
  _input.value = '';
  _selectedIdx = 0;
  renderResults('');
  setTimeout(() => _input.focus(), 30);
}
function close() {
  if (_overlay) _overlay.style.display = 'none';
}

function move(dir) {
  _selectedIdx = Math.max(0, Math.min(_currentItems.length - 1, _selectedIdx + dir));
  highlight();
}
function highlight() {
  _results.querySelectorAll('.cmd-result-item').forEach((el, i) => {
    el.classList.toggle('selected', i === _selectedIdx);
    if (i === _selectedIdx) el.scrollIntoView({ block:'nearest' });
  });
}
function selectCurrent() {
  const item = _currentItems[_selectedIdx];
  if (item) { item.action(); close(); }
}

function renderResults(query) {
  _currentItems = [];
  const q = query.toLowerCase().trim();

  // Route shortcuts
  const matchedRoutes = q
    ? ROUTES.filter(r => r.label.toLowerCase().includes(q) || r.key.includes(q))
    : ROUTES;
  if (matchedRoutes.length) {
    _currentItems.push(...matchedRoutes.map(r => ({
      label: r.label, icon: r.icon, sub: 'Navigation',
      action: () => navigate(r.key)
    })));
  }

  // Magazine search
  if (q) {
    const mags = State.allIssues.filter(i =>
      (i.magazine||'').toLowerCase().includes(q) ||
      (i.numero||'').toLowerCase().includes(q)
    ).slice(0, 8);
    _currentItems.push(...mags.map(i => ({
      label: `${i.magazine} — N°${i.numero}`, icon: '📰', sub: i.statut_numero || '',
      action: () => {
        State.setCurrentMag(i.magazine);
        State.setCurrentNum(i.numero);
        navigate('articles');
      }
    })));
  }

  if (!_currentItems.length) {
    _results.innerHTML = `<div class="cmd-empty">Aucun résultat pour "${esc(query)}"</div>`;
    return;
  }

  _results.innerHTML = _currentItems.map((item, i) => `
    <div class="cmd-result-item${i===_selectedIdx?' selected':''}" data-idx="${i}">
      <span class="cmd-result-icon">${item.icon}</span>
      <span>${esc(item.label)}</span>
      <span class="cmd-result-sub">${esc(item.sub)}</span>
    </div>`).join('');

  _results.querySelectorAll('.cmd-result-item').forEach(el => {
    el.addEventListener('mouseenter', () => { _selectedIdx = Number(el.dataset.idx); highlight(); });
    el.addEventListener('click', () => { _selectedIdx = Number(el.dataset.idx); selectCurrent(); close(); });
  });
}

export function setupCmdPalette() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (_overlay && _overlay.style.display !== 'none') close();
      else open();
    }
  });
  // Topbar hint click
  document.getElementById('topbar-cmd-hint')?.addEventListener('click', open);
}
