/* PressPilot V2 — helpers.js
   Pure utility functions. No DOM, no state, no side effects. */

export function startOfToday() {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}
export function fmtDateShort(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
}
export function fmtMonth(yyyyMM) {
  if (!yyyyMM) return '';
  const [y, m] = yyyyMM.split('-');
  return new Date(Number(y), Number(m)-1, 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
}
export function isOverdue(s) { return s ? new Date(s) < startOfToday() : false; }
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
export function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
export function toYMD(d) {
  const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${mo}-${day}`;
}
export function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, dd] = s.split('-').map(Number);
  return new Date(y, m-1, dd);
}

export function issueKanbanCol(issue) {
  const s = issue.statut_numero || '';
  if (['Annulé','Stand By/Bloqué/Décalé'].includes(s)) return 'standby';
  if (['Bouclé','Déposé','Publié','Paru'].includes(s)) return 'termine';
  if (['En cours de rédaction','Rédaction'].includes(s)) return 'encours';
  const today = startOfToday();
  if (issue.date_lancement && new Date(issue.date_lancement) > today) return 'avenir';
  return 'encours';
}

export function statNumClass(s) {
  if (!s) return '';
  if (['En cours de rédaction','Rédaction'].includes(s)) return 'pill-progress';
  if (['Bouclé','Déposé','Publié','Paru'].includes(s)) return 'pill-done';
  if (['Annulé','Stand By/Bloqué/Décalé'].includes(s)) return 'pill-problem';
  return 'pill-todo';
}

export function buildPayBadge(s) {
  if (!s) return '';
  const cls = s==='Payé' ? 'kanban-pay-paye' : s==='Facturé' ? 'kanban-pay-facture' : 'kanban-pay-att';
  return `<span class="kanban-pay ${cls}">${esc(s)}</span>`;
}

// Constants used across modules
export const STATUS_OPTIONS = ['A faire','Not started','Stand by','In progress','Fact-check','ReWork','Sujet à revoir','Trop court','Problème','Done but not sure','Done'];
export const STATUS_CLASS = {
  'Done': 's-done', 'Done but not sure': 's-done-unsure',
  'In progress': 's-progress', 'Fact-check': 's-progress',
  'A faire': 's-todo', 'Not started': 's-todo', 'Stand by': 's-todo',
  'Problème': 's-problem', 'Trop court': 's-problem',
  'ReWork': 's-rework', 'Sujet à revoir': 's-rework',
};
export const REDAC_COLOR = { Dany: '#9A5F25', Coralie: '#2A7A5A', Lena: '#7B5EA7' };
export const PRICING = { '32P': 400, '48P': 650, '64P': 750, '80P': 800, '96P': 900, '144P': 1500 };
export const SOMMAIRE_FEE = 70;
export const DOW_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
