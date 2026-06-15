/* PressPilot V2 — calendar.js
   Module: Calendrier.
   Exposes mount(container) / unmount(). */

import * as State from './state.js';
import * as API   from './api.js';
import { esc, addDays, sameDay, parseLocalDate, fmtDateShort, DOW_LABELS, REDAC_COLOR } from './helpers.js';
import { renderViewsDropdown } from './views.js';
import { navigate } from './nav.js';

let _mounted = false;

export function mount(container) {
  _mounted = true;
  container.innerHTML = buildHTML();
  setupControls();
  loadCalendar();
}
export function unmount() {
  _mounted = false;
}

function buildHTML() {
  return `<div class="cal-wrap">
    <div class="cal-toolbar">
      <div class="cal-views">
        <button class="cal-view-btn${State.calViewMode==='week'?' active':''}" data-view="week">Semaine</button>
        <button class="cal-view-btn${State.calViewMode==='month'?' active':''}" data-view="month">Mois</button>
        <button class="cal-view-btn${State.calViewMode==='3month'?' active':''}" data-view="3month">3 Mois</button>
      </div>
      <div class="cal-nav">
        <button class="btn btn-ghost btn-sm" id="cal-prev">‹</button>
        <span id="cal-range"></span>
        <button class="btn btn-ghost btn-sm" id="cal-next">›</button>
        <button class="btn btn-ghost btn-sm" id="cal-today">Aujourd'hui</button>
      </div>
      <div class="cal-filters">
        <select id="cal-filter-redacteur">
          <option value="">Tous rédacteurs</option>
          ${Object.keys(REDAC_COLOR).map(r=>`<option${r===State.calFilterRedacteur?' selected':''}>${r}</option>`).join('')}
        </select>
        <div class="cal-statut-wrap" id="cal-statut-wrap">
          <button class="btn btn-ghost btn-sm" id="cal-statut-btn">Statuts ▾</button>
          <div class="cal-statut-dropdown" id="cal-statut-dropdown" style="display:none"></div>
        </div>
        <div class="views-btn-wrap" data-module="calendrier"></div>
      </div>
    </div>
    <div class="cal-grid-container" id="cal-grid-container"></div>
  </div>`;
}

function setupControls() {
  document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.setCalViewMode(btn.dataset.view);
      renderCalendar();
    });
  });
  document.getElementById('cal-prev')?.addEventListener('click', () => { State.setCalCurrentDate(calNav(State.calCurrentDate, -1)); renderCalendar(); });
  document.getElementById('cal-next')?.addEventListener('click', () => { State.setCalCurrentDate(calNav(State.calCurrentDate,  1)); renderCalendar(); });
  document.getElementById('cal-today')?.addEventListener('click', () => { const d = new Date(); d.setHours(0,0,0,0); State.setCalCurrentDate(d); renderCalendar(); });
  document.getElementById('cal-filter-redacteur')?.addEventListener('change', e => { State.setCalFilterRedacteur(e.target.value); renderCalendar(); });
  document.getElementById('cal-statut-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const dropdown = document.getElementById('cal-statut-dropdown');
    const open = dropdown.style.display !== 'none';
    document.querySelectorAll('.views-menu, .cal-statut-dropdown').forEach(m => m.style.display='none');
    dropdown.style.display = open ? 'none' : 'block';
  });
  renderViewsDropdown('calendrier', getCalendarState, applyCalendarState);
}

function loadCalendar() {
  State.setCalAvailStatuts([...new Set(State.allIssues.map(i=>i.statut_numero).filter(Boolean))].sort());
  if (State.calShownStatuts === null) {
    State.setCalShownStatuts(new Set(State.calAvailStatuts.filter(s => !/annul|stand\s*by|bloqué/i.test(s))));
  }
  buildCalStatutDropdown(State.calAvailStatuts);
  renderCalendar();
}

function buildCalStatutDropdown(statuses) {
  const menu = document.getElementById('cal-statut-dropdown');
  if (!menu) return;
  menu.innerHTML = statuses.map(s => `<label class="cal-statut-item">
    <input type="checkbox" value="${esc(s)}" ${State.calShownStatuts && State.calShownStatuts.has(s) ? 'checked' : ''}>
    <span>${esc(s)}</span>
  </label>`).join('');
  menu.querySelectorAll('input').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const set = State.calShownStatuts ? new Set(State.calShownStatuts) : new Set(statuses);
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      State.setCalShownStatuts(set);
      updateCalStatutBtnLabel(statuses);
      renderCalendar();
    });
  });
  updateCalStatutBtnLabel(statuses);
}

function updateCalStatutBtnLabel(statuses) {
  const btn = document.getElementById('cal-statut-btn');
  if (!btn) return;
  const shown = State.calShownStatuts ? State.calShownStatuts.size : statuses.length;
  btn.textContent = shown === statuses.length ? 'Statuts ▾' : `Statuts (${shown}) ▾`;
}

function calNav(date, dir) {
  const d = new Date(date);
  if (State.calViewMode==='week')        d.setDate(d.getDate() + dir*7);
  else if (State.calViewMode==='month')  d.setMonth(d.getMonth() + dir);
  else                                   d.setMonth(d.getMonth() + dir*3);
  return d;
}

function getMonthWeeks(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const startDow = (first.getDay()+6)%7;
  const days = [];
  for (let i=startDow-1; i>=0; i--) days.push(new Date(year, month, -i));
  for (let d=1; d<=last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length%7!==0) { const nxt=new Date(days[days.length-1]); nxt.setDate(nxt.getDate()+1); days.push(nxt); }
  const weeks=[];
  for (let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
  return weeks;
}

function getWeekBars(weekDays, issues) {
  const weekStart = weekDays[0], weekEnd = weekDays[6];
  const bars = [];
  for (const iss of issues) {
    if (!iss.date_lancement) continue;
    const endStr = iss.deadline_redaction || iss.deadline;
    if (!endStr) continue;
    const startDate = parseLocalDate(iss.date_lancement);
    const endDate   = parseLocalDate(endStr);
    if (!startDate || !endDate || startDate > weekEnd || endDate < weekStart) continue;
    const clampStart = startDate < weekStart ? weekStart : startDate;
    const clampEnd   = endDate   > weekEnd   ? weekEnd   : endDate;
    let startCol = weekDays.findIndex(d => sameDay(d, clampStart));
    let endCol   = weekDays.findIndex(d => sameDay(d, clampEnd));
    if (startCol < 0) startCol = 0;
    if (endCol   < 0) endCol   = 6;
    bars.push({ iss, startCol, endCol, color: REDAC_COLOR[iss.redacteur] || '#9A5F25', showLabel: startDate >= weekStart });
  }
  return bars;
}

function stackBars(bars) {
  const rowRanges = [];
  return bars.map(bar => {
    let row = 0;
    while (row < 12) {
      if (!rowRanges[row]) rowRanges[row] = [];
      const conflict = rowRanges[row].some(r => !(bar.endCol < r.startCol || bar.startCol > r.endCol));
      if (!conflict) { rowRanges[row].push({ startCol: bar.startCol, endCol: bar.endCol }); return { ...bar, row }; }
      row++;
    }
    return { ...bar, row: 11 };
  });
}

function renderWeekRow(weekDays, issues, today, currentMonth) {
  const dayNums = weekDays.map(day => {
    const isToday = sameDay(day, today);
    const isOther = currentMonth !== null && day.getMonth() !== currentMonth;
    let cls = 'cal-dn' + (isOther?' cal-dn-other':'');
    return `<div class="${cls}">${isToday ? `<span class="cal-dn-today">${day.getDate()}</span>` : day.getDate()}</div>`;
  }).join('');

  const rawBars = getWeekBars(weekDays, issues);
  const stacked = stackBars(rawBars);
  const rowCount = stacked.reduce((m, b) => Math.max(m, b.row), -1) + 1;
  const eventsH = Math.max(90, rowCount * 26 + 20);

  const barsHtml = stacked.map(bar => {
    const leftPct  = (bar.startCol / 7 * 100).toFixed(3);
    const widthPct = ((bar.endCol - bar.startCol + 1) / 7 * 100).toFixed(3);
    const topPx    = bar.row * 26 + 6;
    return `<div class="cal-event-bar"
      style="left:calc(${leftPct}% + 3px);width:calc(${widthPct}% - 6px);top:${topPx}px;background:${bar.color}25;border-left:3px solid ${bar.color}"
      data-mag="${esc(bar.iss.magazine)}" data-num="${esc(bar.iss.numero)}"
      title="${esc(bar.iss.magazine)} N°${esc(bar.iss.numero)}">
      ${bar.showLabel ? `<span class="cal-bar-label">${esc(bar.iss.magazine)} N°${esc(bar.iss.numero)}</span>` : ''}
    </div>`;
  }).join('');

  const guides = weekDays.map(() => `<div class="cal-col-guide"></div>`).join('');
  return `<div class="cal-week-row">
    <div class="cal-dn-grid">${dayNums}</div>
    <div class="cal-events-area" style="height:${eventsH}px">
      <div class="cal-col-guides">${guides}</div>
      ${barsHtml}
    </div>
  </div>`;
}

function renderMonthGrid(weeks, issues, today, currentMonth) {
  const header = `<div class="cal-grid-header">${DOW_LABELS.map(l=>`<div class="cal-grid-dow">${l}</div>`).join('')}</div>`;
  const rows = weeks.map(weekDays => renderWeekRow(weekDays, issues, today, currentMonth)).join('');
  return `<div class="cal-grid">${header}${rows}</div>`;
}

function renderCalendar() {
  if (!_mounted) return;
  let issues = [...State.allIssues];
  if (State.calFilterRedacteur) issues = issues.filter(i => i.redacteur===State.calFilterRedacteur);
  if (State.calShownStatuts)    issues = issues.filter(i => !i.statut_numero || State.calShownStatuts.has(i.statut_numero));
  const container = document.getElementById('cal-grid-container');
  if (!container) return;
  const today = new Date(); today.setHours(0,0,0,0);

  if (State.calViewMode==='week') {
    const dow = (State.calCurrentDate.getDay()+6)%7;
    const monday = addDays(State.calCurrentDate, -dow);
    const days = Array.from({length:7}, (_, i) => addDays(monday, i));
    const rangeEl = document.getElementById('cal-range');
    if (rangeEl) rangeEl.textContent = monday.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}) + ' — ' + days[6].toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
    container.innerHTML = renderMonthGrid([days], issues, today, null);
  } else if (State.calViewMode==='month') {
    const y = State.calCurrentDate.getFullYear(), m = State.calCurrentDate.getMonth();
    const rangeEl = document.getElementById('cal-range');
    if (rangeEl) rangeEl.textContent = State.calCurrentDate.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    container.innerHTML = renderMonthGrid(getMonthWeeks(y, m), issues, today, m);
  } else {
    const y = State.calCurrentDate.getFullYear(), m = State.calCurrentDate.getMonth();
    const months = [0,1,2].map(off => { const d=new Date(y,m+off,1); return {year:d.getFullYear(),month:d.getMonth()}; });
    const first = new Date(months[0].year, months[0].month, 1);
    const last  = new Date(months[2].year, months[2].month, 1);
    const rangeEl = document.getElementById('cal-range');
    if (rangeEl) rangeEl.textContent = first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}) + ' — ' + last.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    container.innerHTML = `<div class="cal-3months">${months.map(({year,month}) => {
      const title = new Date(year,month,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
      return `<div class="cal-month-block"><div class="cal-month-title">${title}</div>${renderMonthGrid(getMonthWeeks(year,month), issues, today, month)}</div>`;
    }).join('')}</div>`;
  }

  container.querySelectorAll('.cal-event-bar').forEach(bar => {
    bar.addEventListener('click', e => {
      e.stopPropagation();
      const mag=bar.dataset.mag, num=bar.dataset.num;
      if (mag&&num) {
        State.setCurrentMag(mag); State.setCurrentNum(num);
        navigate('articles');
      }
    });
  });
}

export function getCalendarState() {
  return { viewMode: State.calViewMode, filterRedacteur: State.calFilterRedacteur, filterStatuts: State.calShownStatuts ? [...State.calShownStatuts] : null };
}
export function applyCalendarState(state) {
  if (!state) return;
  if (state.viewMode !== undefined) {
    State.setCalViewMode(state.viewMode);
    document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view===State.calViewMode));
  }
  if (state.filterRedacteur !== undefined) { State.setCalFilterRedacteur(state.filterRedacteur); const el=document.getElementById('cal-filter-redacteur'); if(el) el.value=state.filterRedacteur; }
  if (state.filterStatuts   !== undefined) {
    State.setCalShownStatuts(state.filterStatuts ? new Set(state.filterStatuts) : null);
    buildCalStatutDropdown(State.calAvailStatuts);
  }
  renderCalendar();
}
