/* PressPilot V2 — state.js
   Central mutable state shared across modules.
   Import via: import * as State from './state.js' */

export let cfg = {};
export let allIssues = [];
export let articlesByKey = {};

// Calendar
export let calViewMode = 'month';
export let calCurrentDate = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
export let calFilterRedacteur = '';
export let calShownStatuts = null;
export let calAvailStatuts = [];

// Articles filters / sort
export let currentMag = '', currentNum = '';
export let artSortField = 'page_debut', artSortDir = 1;
export let artSearch = '', artFilterRedacteur = '';
export let selectedIds = new Set();
export let articlesCache = {};

// Copy modal
export let copySourceMag = '', copySourceNum = '';

// Issues table
export let issuesSearch = '', issuesFilterStatut = '', issuesFilterRedacteur = '';
export let issuesSortBy = 'magazine', issuesSortDir = 1;
export let extraIssueId = null;

// Dashboard filters
export let dashSearch = '', dashFilterMonth = '', dashFilterRedacteur = '', dashFilterStatut = '';

// Billing
export let billingModalSetup = false;
export let billingData = [];

// Undo / toast
export let undoStack = [];
export let toastTimer = null;

// ── SETTERS ───────────────────────────────────────────────────────────────────
export function setCfg(v)    { cfg = v; }
export function setAllIssues(v) { allIssues = v; }
export function setArticlesByKey(v) { articlesByKey = v; }

export function setCalViewMode(v)          { calViewMode = v; }
export function setCalCurrentDate(v)       { calCurrentDate = v; }
export function setCalFilterRedacteur(v)   { calFilterRedacteur = v; }
export function setCalShownStatuts(v)      { calShownStatuts = v; }
export function setCalAvailStatuts(v)      { calAvailStatuts = v; }

export function setCurrentMag(v)           { currentMag = v; }
export function setCurrentNum(v)           { currentNum = v; }
export function setArtSortField(v)         { artSortField = v; }
export function setArtSortDir(v)           { artSortDir = v; }
export function setArtSearch(v)            { artSearch = v; }
export function setArtFilterRedacteur(v)   { artFilterRedacteur = v; }
export function setArticlesCache(v)        { articlesCache = { ...articlesCache, ...v }; }
export function clearArticlesCache()       { articlesCache = {}; }

export function setCopySource(mag, num)    { copySourceMag = mag; copySourceNum = num; }

export function setIssuesSearch(v)         { issuesSearch = v; }
export function setIssuesFilterStatut(v)   { issuesFilterStatut = v; }
export function setIssuesFilterRedacteur(v){ issuesFilterRedacteur = v; }
export function setIssuesSortBy(v)         { issuesSortBy = v; }
export function setIssuesSortDir(v)        { issuesSortDir = v; }
export function setExtraIssueId(v)         { extraIssueId = v; }

export function setDashSearch(v)           { dashSearch = v; }
export function setDashFilterMonth(v)      { dashFilterMonth = v; }
export function setDashFilterRedacteur(v)  { dashFilterRedacteur = v; }
export function setDashFilterStatut(v)     { dashFilterStatut = v; }

export function setBillingModalSetup(v)    { billingModalSetup = v; }
export function setBillingData(v)          { billingData = v; }

export function pushUndoStack(action)      { undoStack.push(action); if (undoStack.length > 20) undoStack.shift(); }
export function popUndoStack()             { return undoStack.pop(); }
export function setToastTimer(v)           { toastTimer = v; }
