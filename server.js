const express  = require('express');
const { DatabaseSync } = require('node:sqlite');
const ExcelJS   = require('exceljs');
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');

// ─── LOAD .env ───────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx < 1) return;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !(k in process.env)) process.env[k] = v;
  });
}

const app  = express();
const PORT = process.env.PORT || 3737;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'presspilot.db');

const APP_USERNAME   = process.env.SOMMAIRE_USERNAME || 'dckay';
const APP_PASSWORD   = process.env.SOMMAIRE_PASSWORD;
const SESSION_TTL    = 7 * 24 * 60 * 60 * 1000; // 7 jours

// ─── SECURITY: rate limiter ───────────────────────────────────
const rateMap = new Map();
setInterval(() => rateMap.clear(), 60_000);
function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const n = (rateMap.get(ip) || 0) + 1;
  rateMap.set(ip, n);
  if (n > 120) return res.status(429).send('Too many requests');
  next();
}

// ─── SECURITY: sessions ───────────────────────────────────────
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of sessions) {
    if (sess.expires < now) sessions.delete(id);
  }
}, 3_600_000);

function parseCookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) result[k.trim()] = v.join('=').trim();
  }
  return result;
}

function sessionAuth(req, res, next) {
  if (!APP_PASSWORD) return next();
  const cookies = parseCookies(req);
  const sess = sessions.get(cookies.pp_session);
  if (sess && sess.expires > Date.now()) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non authentifié' });
  res.redirect('/login');
}

// ─── SECURITY: headers ────────────────────────────────────────
app.use(rateLimit);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

// ─── LOGIN / LOGOUT ───────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));

app.get('/login', (req, res) => {
  if (!APP_PASSWORD) return res.redirect('/');
  const cookies = parseCookies(req);
  const sess = sessions.get(cookies.pp_session);
  if (sess && sess.expires > Date.now()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!APP_PASSWORD || (username === APP_USERNAME && password === APP_PASSWORD)) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + SESSION_TTL });
    const maxAge = Math.floor(SESSION_TTL / 1000);
    res.setHeader('Set-Cookie', `pp_session=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Identifiants incorrects' });
});

app.get('/logout', (req, res) => {
  const cookies = parseCookies(req);
  sessions.delete(cookies.pp_session);
  res.setHeader('Set-Cookie', 'pp_session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/');
  res.redirect('/login');
});

app.use(sessionAuth);
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
}));

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new DatabaseSync(DB_PATH);

// ─── SCHEMA ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    magazine TEXT NOT NULL DEFAULT '',
    numero TEXT NOT NULL DEFAULT '',
    titre TEXT NOT NULL DEFAULT '',
    type_contenu TEXT, rubrique TEXT,
    page_debut INTEGER, page_fin INTEGER,
    status TEXT DEFAULT 'A faire',
    auteur TEXT, resume TEXT, lien_article TEXT,
    article_source TEXT, validation TEXT DEFAULT 'A valider',
    commentaires TEXT, signes INTEGER, deadline TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    magazine TEXT NOT NULL, numero TEXT NOT NULL,
    deadline TEXT,
    UNIQUE(magazine, numero)
  );
  CREATE TABLE IF NOT EXISTS config_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL, value TEXT NOT NULL,
    color TEXT, position INTEGER DEFAULT 0,
    UNIQUE(category, value)
  );
`);

// ─── MIGRATIONS issues table ─────────────────────────────────
const issueCols = db.prepare('PRAGMA table_info(issues)').all().map(c => c.name);
const issueNewCols = {
  date_lancement:    'TEXT',
  deadline_redaction:'TEXT',
  statut_numero:     "TEXT DEFAULT 'En préparation'",
  statut_paiement:   "TEXT DEFAULT 'En attente'",
  format_page:       'TEXT',
  note:              'TEXT',
  lien_dossier:      'TEXT',
  type_magazine:     'TEXT',
  redacteur:         'TEXT',
};
for (const [col, def] of Object.entries(issueNewCols)) {
  if (!issueCols.includes(col)) db.exec(`ALTER TABLE issues ADD COLUMN ${col} ${def}`);
}

// ─── MIGRATIONS articles table ───────────────────────────────
const artCols = db.prepare('PRAGMA table_info(articles)').all().map(c => c.name);
if (!artCols.includes('redacteur')) db.exec(`ALTER TABLE articles ADD COLUMN redacteur TEXT`);

// ─── SEEDS ───────────────────────────────────────────────────
const ISSUES_SEED = [
  { magazine: 'France hebdomadaire',        numero: '20',      deadline: '2026-06-10' },
  { magazine: 'Spéciale Dernière',           numero: '19',      deadline: '2026-05-14' },
  { magazine: 'Crimes Magazines',            numero: '58',      deadline: '2026-06-13' },
  { magazine: "C'Est Dit",                   numero: '51',      deadline: '2026-06-24' },
  { magazine: 'Intimite',                    numero: '48',      deadline: '2026-06-08' },
  { magazine: 'Cote France',                 numero: '57',      deadline: '2026-06-03' },
  { magazine: 'Spécial Police',              numero: 'Spécial', deadline: '2026-05-21' },
  { magazine: 'Journal De France',           numero: '112',     deadline: '2026-06-01' },
  { magazine: 'Ouah',                        numero: '—',       deadline: '2026-05-17' },
  { magazine: 'Cote France',                 numero: '58',      deadline: '2026-06-17' },
  { magazine: 'Royauté',                     numero: '—',       deadline: '2026-05-26' },
  { magazine: 'Oula',                        numero: '71',      deadline: '2026-06-24' },
  { magazine: 'Choc',                        numero: '218',     deadline: '2026-06-29' },
  { magazine: 'Coté France Destins Brisés',  numero: '22',      deadline: '2026-06-24' },
  { magazine: 'Paris Hebdo',                 numero: '37',      deadline: '2026-07-01' },
  { magazine: 'Royal Life',                  numero: '33',      deadline: '2026-06-25' },
  { magazine: 'Scenes de Crimes',            numero: '16',      deadline: '2026-07-01' },
  { magazine: 'Souvenir Souvenir',           numero: '40',      deadline: '2026-05-10' },
  { magazine: 'Stop Arnaques',               numero: '157',     deadline: '2026-06-10' },
  { magazine: 'Intimité Dimanche',           numero: '32',      deadline: '2026-05-07' },
  { magazine: 'Enquetes Magazine',           numero: '26',      deadline: '2026-06-03' },
];
const issueCount = db.prepare('SELECT COUNT(*) as c FROM issues').get().c;
if (issueCount === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO issues (magazine, numero, deadline) VALUES (?, ?, ?)');
  for (const n of ISSUES_SEED) ins.run(n.magazine, n.numero, n.deadline);
}

const CONFIG_SEEDS = [
  // type_contenu
  { category: 'type_contenu', value: 'Article',    color: null },
  { category: 'type_contenu', value: 'Rubrique',   color: null },
  { category: 'type_contenu', value: 'Dossier',    color: '#FFB347' },
  { category: 'type_contenu', value: 'Interview',  color: '#C9E4FF' },
  { category: 'type_contenu', value: 'Brève',      color: '#FFFACD' },
  { category: 'type_contenu', value: 'Edito',      color: '#F0E68C' },
  { category: 'type_contenu', value: 'Couverture', color: '#F0F0F0' },
  { category: 'type_contenu', value: 'Pub',        color: '#FFD700' },
  { category: 'type_contenu', value: 'Sommaire',   color: '#D8D8D8' },
  { category: 'type_contenu', value: 'Ouverture',  color: '#E8E8E8' },
  // rubriques
  { category: 'rubrique', value: 'A la une',             color: '#FFE066' },
  { category: 'rubrique', value: 'Actu Simple',          color: '#A8E6CF' },
  { category: 'rubrique', value: 'Actualités',           color: '#B8F0D8' },
  { category: 'rubrique', value: 'Double Actu',          color: '#88D8FF' },
  { category: 'rubrique', value: '2 News',               color: '#B8E4FF' },
  { category: 'rubrique', value: 'Dossier',              color: '#FFB347' },
  { category: 'rubrique', value: 'Dossier Spécial',      color: '#FF9933' },
  { category: 'rubrique', value: 'Enquete',              color: '#FF9966' },
  { category: 'rubrique', value: 'Santé',                color: '#FFB6C1' },
  { category: 'rubrique', value: 'Beauté',               color: '#FFD1DC' },
  { category: 'rubrique', value: 'Voyage',               color: '#87CEEB' },
  { category: 'rubrique', value: 'Coté voyage',          color: '#87CEEB' },
  { category: 'rubrique', value: 'Cuisine',              color: '#FFDAB9' },
  { category: 'rubrique', value: 'Cooking',              color: '#FFDAB9' },
  { category: 'rubrique', value: 'Horoscope',            color: '#DDA0DD' },
  { category: 'rubrique', value: 'En forme',             color: '#B5EAD7' },
  { category: 'rubrique', value: 'Vie Pratique',         color: '#C7CEEA' },
  { category: 'rubrique', value: 'Sexo',                 color: '#FFD9E8' },
  { category: 'rubrique', value: 'Sextips',              color: '#FFD9E8' },
  { category: 'rubrique', value: 'Sexlist',              color: '#FFD9E8' },
  { category: 'rubrique', value: 'Destins Brisé',        color: '#F08080' },
  { category: 'rubrique', value: 'Portrait',             color: '#E8D5B7' },
  { category: 'rubrique', value: 'Nostalgie',            color: '#FAEBD7' },
  { category: 'rubrique', value: 'Témoignage',           color: '#FFF9C4' },
  { category: 'rubrique', value: 'Coté vécu',            color: '#FFF9C4' },
  { category: 'rubrique', value: 'Story',                color: '#F3E5F5' },
  { category: 'rubrique', value: 'Royauté',              color: '#E8D5C0' },
  { category: 'rubrique', value: 'Domaine Royal',        color: '#E8D5C0' },
  { category: 'rubrique', value: 'Incroyable mais vrai', color: '#FFE4B5' },
  // Rubriques sans couleur spécifique (null = gris clair par défaut)
  { category: 'rubrique', value: 'Agenda',               color: null },
  { category: 'rubrique', value: 'Bien-être',            color: '#B5EAD7' },
  { category: 'rubrique', value: 'Business',             color: null },
  { category: 'rubrique', value: 'Confidences',          color: '#FFF9C4' },
  { category: 'rubrique', value: 'Découverte',           color: null },
  { category: 'rubrique', value: 'En Bref',              color: '#FFFACD' },
  { category: 'rubrique', value: 'Enquetes Magazine',    color: '#FF9966' },
  { category: 'rubrique', value: 'Gros plans sur',       color: null },
  { category: 'rubrique', value: 'Guide',                color: null },
  { category: 'rubrique', value: 'Histoire',             color: '#FAEBD7' },
  { category: 'rubrique', value: 'Hommage',              color: '#E8D5B7' },
  { category: 'rubrique', value: 'Le jour où',           color: '#FFF9C4' },
  { category: 'rubrique', value: 'Lifestyle',            color: null },
  { category: 'rubrique', value: 'News',                 color: '#B8E4FF' },
  { category: 'rubrique', value: 'Retro',                color: '#FAEBD7' },
  { category: 'rubrique', value: 'Souvenirs Souvenirs',  color: '#FAEBD7' },
  { category: 'rubrique', value: 'Télévision',           color: null },
  // format_page
  { category: 'format_page', value: '32P', color: null },
  { category: 'format_page', value: '48P', color: null },
  { category: 'format_page', value: '64P', color: null },
  { category: 'format_page', value: '96P', color: null },
  // statut_numero
  { category: 'statut_numero', value: 'En préparation',      color: null },
  { category: 'statut_numero', value: 'En cours de rédaction', color: null },
  { category: 'statut_numero', value: 'Bouclé',              color: null },
  { category: 'statut_numero', value: 'Publié',              color: null },
  // statut_paiement
  { category: 'statut_paiement', value: 'En attente', color: null },
  { category: 'statut_paiement', value: 'Facturé',    color: null },
  { category: 'statut_paiement', value: 'Payé',       color: null },
];
const cfgCount = db.prepare('SELECT COUNT(*) as c FROM config_values').get().c;
if (cfgCount === 0) {
  const insCfg = db.prepare('INSERT OR IGNORE INTO config_values (category, value, color, position) VALUES (?, ?, ?, ?)');
  CONFIG_SEEDS.forEach((s, i) => insCfg.run(s.category, s.value, s.color, i));
}

// ─── UTILS ───────────────────────────────────────────────────
function colorToARGB(hex) {
  if (!hex) return 'FFF5F1EA';
  return 'FF' + hex.replace('#', '').toUpperCase();
}

function getArticleColor(article, colorMap) {
  if (article.type_contenu && colorMap[article.type_contenu]) return colorMap[article.type_contenu];
  if (article.rubrique && colorMap[article.rubrique]) return colorMap[article.rubrique];
  return '#EDE6D8';
}

function applyBorder(cell) {
  const b = { style: 'thin', color: { argb: 'FFD0C8BE' } };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

// ─── ARTICLES ────────────────────────────────────────────────
app.get('/api/articles', (req, res) => {
  const { magazine, numero, status, page_min, page_max } = req.query;
  let q = 'SELECT * FROM articles WHERE 1=1';
  const p = [];
  if (magazine) { q += ' AND magazine = ?'; p.push(magazine); }
  if (numero)   { q += ' AND numero = ?';   p.push(numero); }
  if (status)   { q += ' AND status = ?';   p.push(status); }
  // Filtres par page : un article sans page (NULL) ne matche jamais un filtre page.
  // Sémantique : l'intervalle [page_debut, page_fin] intersecte [page_min, page_max].
  // page_fin NULL -> l'article occupe une seule page (page_debut).
  if (page_min !== undefined && page_max !== undefined) {
    q += ' AND page_debut IS NOT NULL AND page_debut <= ? AND COALESCE(page_fin, page_debut) >= ?';
    p.push(Number(page_max), Number(page_min));
  } else if (page_min !== undefined) {
    q += ' AND page_debut IS NOT NULL AND COALESCE(page_fin, page_debut) >= ?';
    p.push(Number(page_min));
  } else if (page_max !== undefined) {
    q += ' AND page_debut IS NOT NULL AND page_debut <= ?';
    p.push(Number(page_max));
  }
  q += ' ORDER BY COALESCE(page_debut, 9999), id';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/numeros', (req, res) => {
  const fromIssues = db.prepare('SELECT magazine, numero FROM issues ORDER BY magazine, numero').all();
  const fromArticles = db.prepare("SELECT DISTINCT magazine, numero FROM articles WHERE magazine != '' ORDER BY magazine, numero").all();
  const seen = new Set(fromIssues.map(r => `${r.magazine}||${r.numero}`));
  const merged = [...fromIssues];
  for (const r of fromArticles) {
    if (!seen.has(`${r.magazine}||${r.numero}`)) merged.push(r);
  }
  res.json(merged);
});

app.post('/api/articles', (req, res) => {
  const cols = ['magazine','numero','titre','type_contenu','rubrique','page_debut',
    'page_fin','status','auteur','redacteur','resume','lien_article','article_source',
    'validation','commentaires','signes','deadline'];
  const vals = cols.map(c => req.body[c] ?? null);
  const info = db.prepare(`INSERT INTO articles (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/articles/:id', (req, res) => {
  const allowed = ['magazine','numero','titre','type_contenu','rubrique','page_debut',
    'page_fin','status','auteur','redacteur','resume','lien_article','article_source',
    'validation','commentaires','signes','deadline'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ valide' });
  db.prepare(`UPDATE articles SET ${updates.map(([k]) => `${k}=?`).join(',')} WHERE id=?`)
    .run(...updates.map(([,v]) => v), Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/articles/duplicate', (req, res) => {
  const { ids, fields, dest_magazine, dest_numero } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'ids requis' });
  const COPYABLE = ['titre','page_debut','page_fin','type_contenu','rubrique','resume',
    'article_source','commentaires','auteur','redacteur','deadline','signes'];
  const copyFields = Array.isArray(fields) ? fields.filter(f => COPYABLE.includes(f)) : COPYABLE;
  const get = db.prepare('SELECT * FROM articles WHERE id=?');
  const newIds = [];
  let count = 0;
  for (const id of ids) {
    const a = get.get(id);
    if (!a) continue;
    const row = {
      magazine: dest_magazine || a.magazine,
      numero: dest_numero || a.numero,
      status: 'A faire',
    };
    for (const f of copyFields) {
      if (a[f] !== null && a[f] !== undefined) row[f] = a[f];
    }
    if (!row.titre) row.titre = 'Nouvel article';
    const cols = Object.keys(row);
    const info = db.prepare(`INSERT INTO articles (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...Object.values(row));
    newIds.push(info.lastInsertRowid);
    count++;
  }
  res.json({ ok: true, duplicated: count, newIds });
});

app.patch('/api/articles/bulk', (req, res) => {
  const { ids, updates } = req.body;
  if (!ids?.length || !updates) return res.status(400).json({ error: 'ids et updates requis' });
  const allowed = ['magazine','numero','titre','type_contenu','rubrique','page_debut',
    'page_fin','status','auteur','redacteur','resume','validation','commentaires','deadline'];
  const valid = Object.entries(updates).filter(([k]) => allowed.includes(k));
  if (!valid.length) return res.status(400).json({ error: 'Aucun champ valide' });
  db.prepare(`UPDATE articles SET ${valid.map(([k]) => `${k}=?`).join(',')} WHERE id IN (${ids.map(() => '?').join(',')})`)
    .run(...valid.map(([,v]) => v), ...ids);
  res.json({ ok: true, updated: ids.length });
});

app.delete('/api/articles/:id', (req, res) => {
  db.prepare('DELETE FROM articles WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/copy-issue', (req, res) => {
  const { magazine, from_numero, to_numero, fields } = req.body;
  if (!magazine || !from_numero || !to_numero) return res.status(400).json({ error: 'Paramètres manquants' });
  const articles = db.prepare('SELECT * FROM articles WHERE magazine=? AND numero=? ORDER BY page_debut').all(magazine, from_numero);
  if (!articles.length) return res.status(404).json({ error: 'Numéro source introuvable' });
  const copyFields = fields || ['page_debut', 'page_fin', 'type_contenu', 'rubrique'];
  for (const a of articles) {
    const row = { magazine, numero: to_numero, titre: copyFields.includes('titre') ? a.titre : 'Nouvel article', status: 'A faire' };
    if (copyFields.includes('page_debut')) row.page_debut = a.page_debut;
    if (copyFields.includes('page_fin'))   row.page_fin   = a.page_fin;
    if (copyFields.includes('type_contenu')) row.type_contenu = a.type_contenu;
    if (copyFields.includes('rubrique'))   row.rubrique   = a.rubrique;
    if (copyFields.includes('resume'))     row.resume     = a.resume;
    const cols = Object.keys(row), vals = Object.values(row);
    db.prepare(`INSERT INTO articles (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
  }
  res.json({ copied: articles.length });
});

// ─── ISSUES ──────────────────────────────────────────────────
app.get('/api/issues', (req, res) => {
  res.json(db.prepare('SELECT * FROM issues ORDER BY magazine, numero').all());
});

app.post('/api/issues', (req, res) => {
  const { magazine, numero, deadline, date_lancement, deadline_redaction,
    statut_numero, statut_paiement, format_page, note, lien_dossier, type_magazine } = req.body;
  if (!magazine || !numero) return res.status(400).json({ error: 'magazine et numero requis' });
  try {
    const info = db.prepare(`INSERT INTO issues
      (magazine, numero, deadline, date_lancement, deadline_redaction,
       statut_numero, statut_paiement, format_page, note, lien_dossier, type_magazine)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(magazine, numero, deadline||null, date_lancement||null, deadline_redaction||null,
        statut_numero||'En préparation', statut_paiement||'En attente',
        format_page||null, note||null, lien_dossier||null, type_magazine||null);
    res.json({ id: info.lastInsertRowid });
  } catch { res.status(409).json({ error: 'Ce numéro existe déjà' }); }
});

app.put('/api/issues/:id', (req, res) => {
  const fields = ['magazine','numero','deadline','date_lancement','deadline_redaction',
    'statut_numero','statut_paiement','format_page','note','lien_dossier','type_magazine'];
  const updates = fields.map(f => [f, req.body[f] ?? null]);
  db.prepare(`UPDATE issues SET ${updates.map(([k]) => `${k}=?`).join(',')} WHERE id=?`)
    .run(...updates.map(([,v]) => v), Number(req.params.id));
  res.json({ ok: true });
});

app.patch('/api/issues/:id', (req, res) => {
  const allowed = ['magazine','numero','deadline','date_lancement','deadline_redaction',
    'statut_numero','statut_paiement','format_page','note','lien_dossier','type_magazine','redacteur'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ valide' });
  db.prepare(`UPDATE issues SET ${updates.map(([k]) => `${k}=?`).join(',')} WHERE id=?`)
    .run(...updates.map(([,v]) => v), Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/issues/:id', (req, res) => {
  db.prepare('DELETE FROM issues WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─── CONFIG ───────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const rows = db.prepare('SELECT * FROM config_values ORDER BY category, position, value').all();
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }
  res.json(grouped);
});

app.post('/api/config', (req, res) => {
  const { category, value, color } = req.body;
  if (!category || !value) return res.status(400).json({ error: 'category et value requis' });
  try {
    const pos = (db.prepare('SELECT MAX(position) as m FROM config_values WHERE category=?').get(category).m ?? -1) + 1;
    const info = db.prepare('INSERT INTO config_values (category, value, color, position) VALUES (?,?,?,?)').run(category, value, color||null, pos);
    res.json({ id: info.lastInsertRowid });
  } catch { res.status(409).json({ error: 'Valeur déjà existante' }); }
});

app.put('/api/config/:id', (req, res) => {
  const { value, color } = req.body;
  db.prepare('UPDATE config_values SET value=?, color=? WHERE id=?').run(value, color||null, Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/config/:id', (req, res) => {
  db.prepare('DELETE FROM config_values WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─── DASHBOARD ───────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const total  = db.prepare('SELECT COUNT(*) as c FROM articles').get().c;
  const done   = db.prepare("SELECT COUNT(*) as c FROM articles WHERE status='Done'").get().c;
  const inprog = db.prepare("SELECT COUNT(*) as c FROM articles WHERE status IN ('In progress','Fact-check')").get().c;
  const byIssue = db.prepare(`
    SELECT magazine, numero,
      COUNT(*) as total,
      SUM(CASE WHEN status='Done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status IN ('In progress','Fact-check') THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status IN ('Problème','Trop court') THEN 1 ELSE 0 END) as problem,
      SUM(CASE WHEN status IN ('ReWork','Sujet à revoir') THEN 1 ELSE 0 END) as rework,
      SUM(CASE WHEN status IN ('A faire','Not started','Stand by','Done but not sure') THEN 1 ELSE 0 END) as todo,
      MAX(COALESCE(page_fin, 0)) as last_page
    FROM articles WHERE magazine != ''
    GROUP BY magazine, numero ORDER BY magazine, numero
  `).all();
  const deadlines = {};
  db.prepare('SELECT magazine, numero, deadline, date_lancement, deadline_redaction, statut_numero, statut_paiement, format_page, type_magazine FROM issues').all()
    .forEach(r => { deadlines[`${r.magazine}|${r.numero}`] = r; });
  res.json({ total, done, in_progress: inprog, by_issue: byIssue.map(r => ({ ...r, ...deadlines[`${r.magazine}|${r.numero}`] })) });
});

// ─── CDF DATA ─────────────────────────────────────────────────
app.get('/api/cdf', (req, res) => {
  const { magazine, numero } = req.query;
  if (!magazine || !numero) return res.status(400).json({ error: 'magazine et numero requis' });
  const articles = db.prepare(
    'SELECT id, titre, type_contenu, rubrique, page_debut, page_fin, status, article_source FROM articles WHERE magazine=? AND numero=? AND page_debut IS NOT NULL ORDER BY page_debut'
  ).all(magazine, numero);
  const maxPage = articles.reduce((m, a) => Math.max(m, a.page_fin || a.page_debut || 0), 0);
  const colorMap = {};
  db.prepare("SELECT value, color FROM config_values WHERE color IS NOT NULL").all()
    .forEach(r => { colorMap[r.value] = r.color; });
  res.json({ articles, maxPage, colorMap });
});

// ─── CDF EXPORT XLSX ─────────────────────────────────────────
app.get('/api/export/cdf', async (req, res) => {
  const { magazine, numero } = req.query;
  if (!magazine || !numero) return res.status(400).json({ error: 'magazine et numero requis' });

  const articles = db.prepare(
    'SELECT * FROM articles WHERE magazine=? AND numero=? AND page_debut IS NOT NULL ORDER BY page_debut'
  ).all(magazine, numero);
  const maxPage = articles.reduce((m, a) => Math.max(m, a.page_fin || a.page_debut || 0), 0);

  const colorMap = {};
  db.prepare("SELECT value, color FROM config_values WHERE color IS NOT NULL").all()
    .forEach(r => { colorMap[r.value] = r.color; });

  // Group articles by page range (page_debut-page_fin)
  const groupMap = new Map();
  for (const a of articles) {
    const fin = a.page_fin ?? a.page_debut;
    const key = `${a.page_debut}-${fin}`;
    if (!groupMap.has(key)) groupMap.set(key, { debut: a.page_debut, fin, arts: [] });
    groupMap.get(key).arts.push(a);
  }
  const sortedGroups = [...groupMap.values()].sort((a, b) => a.debut - b.debut);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DCKAY Agency — PressPilot';
  const sheet = workbook.addWorksheet(`${magazine} N°${numero}`, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
  });

  const COLS = 10;
  for (let c = 1; c <= COLS; c++) sheet.getColumn(c).width = 18;

  let rowNum = 1;

  // Titre
  sheet.mergeCells(rowNum, 1, rowNum, COLS);
  const titleCell = sheet.getRow(rowNum).getCell(1);
  titleCell.value = `CDF — ${magazine}   N°${numero}`;
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1714' } };
  titleCell.font = { bold: true, size: 13, name: 'Helvetica', color: { argb: 'FFF5F1EA' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(rowNum).height = 28;
  rowNum++;

  // Légende
  const legendItems = Object.entries(colorMap).slice(0, COLS);
  for (let i = 0; i < legendItems.length; i++) {
    const [label, color] = legendItems[i];
    const cell = sheet.getRow(rowNum).getCell(i + 1);
    cell.value = label;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorToARGB(color) } };
    cell.font = { size: 7, bold: true, name: 'Helvetica' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  }
  sheet.getRow(rowNum).height = 22;
  rowNum++;
  rowNum++; // ligne vide

  // Grille CDF — groupée par plage de pages
  for (let pageStart = 1; pageStart <= maxPage; pageStart += COLS) {
    const pageEnd = Math.min(pageStart + COLS - 1, maxPage);
    sheet.getRow(rowNum).height = 100;

    const rowGroups = sortedGroups.filter(g => g.debut <= pageEnd && g.fin >= pageStart);
    let p = pageStart;

    for (const group of rowGroups) {
      const cellStart = Math.max(group.debut, pageStart);
      const cellEnd   = Math.min(group.fin, pageEnd);

      // Pages vides avant ce groupe
      for (let ep = p; ep < cellStart; ep++) {
        const col = ((ep - 1) % COLS) + 1;
        const cell = sheet.getRow(rowNum).getCell(col);
        cell.value = `p.${ep}`;
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F1EA' } };
        cell.font  = { size: 8, color: { argb: 'FFAAAAAA' }, name: 'Helvetica' };
        cell.alignment = { vertical: 'top', horizontal: 'left', indent: 1 };
        applyBorder(cell);
      }
      p = cellStart;

      const colStart = ((cellStart - 1) % COLS) + 1;
      const colEnd   = ((cellEnd   - 1) % COLS) + 1;
      if (colEnd > colStart) sheet.mergeCells(rowNum, colStart, rowNum, colEnd);

      const cell  = sheet.getRow(rowNum).getCell(colStart);
      const color = getArticleColor(group.arts[0], colorMap);
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorToARGB(color) } };
      const pgLabel = cellEnd > cellStart ? `p.${cellStart}–${cellEnd}` : `p.${cellStart}`;
      const countStr = group.arts.length > 1 ? ` (×${group.arts.length})` : '';
      const SHOW_TYPE = new Set(['Couverture', 'Pub', 'Sommaire']);
      const lines = group.arts.map(a => {
        const showType = a.type_contenu && SHOW_TYPE.has(a.type_contenu);
        const headerParts = [];
        if (showType) headerParts.push(a.type_contenu);
        if (a.rubrique) headerParts.push(a.rubrique);
        const header = headerParts.join(' · ');
        const titrePart = a.titre ? '\n  ' + a.titre.substring(0, 70) : '';
        const sourcePart = a.article_source ? '\n  ' + a.article_source : '';
        return `${header}${titrePart}${sourcePart}`;
      }).join('\n─\n');
      cell.value  = `${pgLabel}${countStr}\n${lines}`;
      cell.font   = { size: 8, name: 'Helvetica' };
      cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left', indent: 1 };
      applyBorder(cell);
      p = cellEnd + 1;
    }

    // Pages vides en fin de rangée
    for (let ep = p; ep <= pageEnd; ep++) {
      const col = ((ep - 1) % COLS) + 1;
      const cell = sheet.getRow(rowNum).getCell(col);
      cell.value = `p.${ep}`;
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F1EA' } };
      cell.font  = { size: 8, color: { argb: 'FFAAAAAA' }, name: 'Helvetica' };
      cell.alignment = { vertical: 'top', horizontal: 'left', indent: 1 };
      applyBorder(cell);
    }
    rowNum++;
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="CDF-${magazine.replace(/[^a-z0-9]/gi,'_')}-N${numero}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ─── VIEWS ───────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  UNIQUE(module, name)
)`);

app.get('/api/views', (req, res) => {
  res.json(db.prepare('SELECT * FROM views ORDER BY module, name').all()
    .map(r => ({ ...r, state: JSON.parse(r.state) })));
});
app.post('/api/views', (req, res) => {
  const { module, name, state, is_default } = req.body;
  if (!module || !name || !state) return res.status(400).json({ error: 'missing fields' });
  db.prepare(`INSERT INTO views (module,name,state,is_default) VALUES (?,?,?,?)
    ON CONFLICT(module,name) DO UPDATE SET state=excluded.state, is_default=excluded.is_default`)
    .run(module, name, JSON.stringify(state), is_default ? 1 : 0);
  res.json({ ok: true });
});
app.patch('/api/views/:id', (req, res) => {
  const view = db.prepare('SELECT * FROM views WHERE id=?').get(req.params.id);
  if (!view) return res.status(404).json({ error: 'not found' });
  const { is_default, state } = req.body;
  if (is_default !== undefined) {
    if (is_default) db.prepare('UPDATE views SET is_default=0 WHERE module=?').run(view.module);
    db.prepare('UPDATE views SET is_default=? WHERE id=?').run(is_default ? 1 : 0, req.params.id);
  }
  if (state !== undefined) db.prepare('UPDATE views SET state=? WHERE id=?').run(JSON.stringify(state), req.params.id);
  res.json({ ok: true });
});
app.delete('/api/views/:id', (req, res) => {
  db.prepare('DELETE FROM views WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── FACTURATION ─────────────────────────────────────────────
const PRICING = { '32P': 400, '48P': 650, '64P': 750, '80P': 800, '96P': 900, '144P': 1500 };
const SOMMAIRE_FEE = 70;

db.exec(`
  CREATE TABLE IF NOT EXISTS billing_months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT UNIQUE NOT NULL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS billing_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    issue_id INTEGER,
    include_sommaire INTEGER DEFAULT 1,
    price_override REAL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS billing_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT,
    notes TEXT
  );
`);
try { db.exec('ALTER TABLE billing_lines ADD COLUMN manual_magazine TEXT'); } catch {}
try { db.exec('ALTER TABLE billing_lines ADD COLUMN manual_format TEXT'); } catch {}
try { db.exec('ALTER TABLE billing_lines ADD COLUMN standby INTEGER DEFAULT 0'); } catch {}

app.get('/api/billing', (req, res) => {
  const allMonths = new Set();
  db.prepare('SELECT month FROM billing_months').all().forEach(r => allMonths.add(r.month));
  db.prepare('SELECT DISTINCT month FROM billing_lines').all().forEach(r => allMonths.add(r.month));
  db.prepare('SELECT DISTINCT month FROM billing_payments').all().forEach(r => allMonths.add(r.month));

  const lines = db.prepare(`
    SELECT bl.*, i.magazine, i.numero, i.format_page, i.redacteur, i.statut_numero
    FROM billing_lines bl LEFT JOIN issues i ON bl.issue_id = i.id
    ORDER BY bl.month DESC, bl.id`).all();
  const payments = db.prepare('SELECT * FROM billing_payments ORDER BY month DESC, date DESC, id').all();

  const months = {};
  for (const m of allMonths) months[m] = { month: m, lines: [], payments: [] };
  for (const l of lines) { if (!months[l.month]) months[l.month] = { month: l.month, lines: [], payments: [] }; months[l.month].lines.push(l); }
  for (const p of payments) { if (!months[p.month]) months[p.month] = { month: p.month, lines: [], payments: [] }; months[p.month].payments.push(p); }

  const result = Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
  for (const m of result) {
    const activeLines = m.lines.filter(l => !l.standby);
    m.total_billed = activeLines.reduce((s, l) => {
      const fmt = l.format_page || l.manual_format;
      const price = l.price_override !== null && l.price_override !== undefined ? l.price_override : (PRICING[fmt] || 0);
      return s + price;
    }, 0) + SOMMAIRE_FEE * activeLines.length;
    m.total_paid = m.payments.reduce((s, p) => s + p.amount, 0);
    m.balance = m.total_billed - m.total_paid;
  }
  res.json(result);
});

app.post('/api/billing/months', (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: 'month requis' });
  try { db.prepare('INSERT INTO billing_months (month) VALUES (?)').run(month); }
  catch { /* already exists */ }
  res.json({ ok: true });
});

app.delete('/api/billing/months/:month', (req, res) => {
  const month = req.params.month;
  db.prepare('DELETE FROM billing_months WHERE month=?').run(month);
  db.prepare('DELETE FROM billing_lines WHERE month=?').run(month);
  db.prepare('DELETE FROM billing_payments WHERE month=?').run(month);
  res.json({ ok: true });
});

app.post('/api/billing/lines', (req, res) => {
  const { month, issue_id, manual_magazine, manual_format, price_override, notes } = req.body;
  if (!month) return res.status(400).json({ error: 'month requis' });
  const info = db.prepare('INSERT INTO billing_lines (month, issue_id, manual_magazine, manual_format, price_override, notes) VALUES (?,?,?,?,?,?)')
    .run(month, issue_id || null, manual_magazine || null, manual_format || null, price_override ?? null, notes || null);
  res.json({ id: info.lastInsertRowid });
});

app.patch('/api/billing/lines/:id', (req, res) => {
  const { include_sommaire, price_override, notes, standby } = req.body;
  const updates = [];
  if (include_sommaire !== undefined) updates.push(['include_sommaire', include_sommaire ? 1 : 0]);
  if (price_override   !== undefined) updates.push(['price_override', price_override !== '' && price_override !== null ? Number(price_override) : null]);
  if (notes            !== undefined) updates.push(['notes', notes]);
  if (standby          !== undefined) updates.push(['standby', standby ? 1 : 0]);
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ' });
  db.prepare(`UPDATE billing_lines SET ${updates.map(([k]) => `${k}=?`).join(',')} WHERE id=?`)
    .run(...updates.map(([,v]) => v), Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/billing/lines/:id', (req, res) => {
  db.prepare('DELETE FROM billing_lines WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/billing/payments', (req, res) => {
  const { month, amount, date, notes } = req.body;
  if (!month || amount === undefined) return res.status(400).json({ error: 'month et amount requis' });
  const info = db.prepare('INSERT INTO billing_payments (month, amount, date, notes) VALUES (?,?,?,?)')
    .run(month, Number(amount), date || null, notes || null);
  res.json({ id: info.lastInsertRowid });
});

app.patch('/api/billing/payments/:id', (req, res) => {
  const { amount, date, notes } = req.body;
  const updates = [];
  if (amount !== undefined) updates.push(['amount', Number(amount)]);
  if (date   !== undefined) updates.push(['date', date || null]);
  if (notes  !== undefined) updates.push(['notes', notes || null]);
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ' });
  db.prepare(`UPDATE billing_payments SET ${updates.map(([k]) => `${k}=?`).join(',')} WHERE id=?`)
    .run(...updates.map(([,v]) => v), Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/billing/payments/:id', (req, res) => {
  db.prepare('DELETE FROM billing_payments WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─── ADMIN : MIGRATION DB ────────────────────────────────────
const MIGRATION_TABLES = ['articles','issues','config_values','billing_months','billing_lines','billing_payments','views'];

app.get('/api/admin/export', (req, res) => {
  const data = {};
  for (const t of MIGRATION_TABLES) {
    try { data[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch { data[t] = []; }
  }
  res.json(data);
});

app.post('/api/admin/import', (req, res) => {
  const data = req.body;
  try {
    db.exec('BEGIN');
    for (const t of [...MIGRATION_TABLES].reverse()) {
      try { db.exec(`DELETE FROM ${t}`); } catch {}
    }
    for (const t of MIGRATION_TABLES) {
      const rows = data[t];
      if (!rows?.length) continue;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);
      for (const row of rows) stmt.run(...cols.map(c => row[c] ?? null));
    }
    db.exec('COMMIT');
    const counts = Object.fromEntries(MIGRATION_TABLES.map(t => [t, data[t]?.length || 0]));
    res.json({ ok: true, counts });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`PressPilot → http://localhost:${PORT}`));
